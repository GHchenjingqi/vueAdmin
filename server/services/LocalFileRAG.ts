/**
 * LocalFileRAG 检索服务
 *
 * 职责：从本地 .ai-knowledge/ 知识库中检索最相关的项目规范和代码示例
 * 基于关键词匹配 + 文件路径权重 + 内容相似度评分
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const KNOWLEDGE_BASE_DIR = path.resolve(__dirname, '../../.ai-knowledge')
const INDEX_FILE = path.join(KNOWLEDGE_BASE_DIR, 'knowledge-index.json')

interface KnowledgeIndexEntry {
  path: string
  title: string
  keywords: string[]
  weight: number
  size: number
}

interface KnowledgeIndex {
  version: string
  generatedAt: string
  totalFiles: number
  files: KnowledgeIndexEntry[]
}

interface RetrievalResult {
  path: string
  title: string
  content: string
  score: number
  weight: number
  keywords: string[]
}

interface RetrievalOptions {
  topK: number
  minScore: number
  includeContent: boolean
}

// 中英文停用词
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'must', 'can', 'could', 'in', 'on', 'at',
  'to', 'for', 'of', 'with', 'by', 'from', 'as', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'under',
  'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too',
  'very', 'just', 'now', 'here', 'there', 'when', 'where', 'why', 'how',
  '这个', '那个', '可以', '需要', '一个', '所有', '每个', '某些',
  '如果', '因为', '所以', '但是', '而且', '或者', '然后', '虽然',
  '什么', '怎么', '哪', '为什么', '什么时候', '在', '的', '是',
  '了', '吗', '呢', '吧', '啊', '哦', '嗯', '这', '那', '和',
  '与', '对', '把', '被', '让', '从', '到', '向', '关于', '对于',
])

/**
 * 对文本进行分词（支持中英文混合）
 */
function tokenize(text: string): string[] {
  const tokens: string[] = []

  // 提取英文单词（连续字母）
  const englishWords = text.toLowerCase().match(/[a-z]+/g) || []
  tokens.push(...englishWords)

  // 提取中文词组（连续中文字符）
  const chineseWords = text.match(/[\u4e00-\u9fa5]+/g) || []
  for (const word of chineseWords) {
    // 中文按 2-4 字切分 n-gram
    for (let i = 0; i < word.length; i++) {
      for (let len = 1; len <= Math.min(4, word.length - i); len++) {
        const ngram = word.substring(i, i + len)
        if (ngram.length >= 1) {
          tokens.push(ngram)
        }
      }
    }
  }

  // 过滤停用词和单字符
  return tokens.filter(t => t.length > 1 && !STOP_WORDS.has(t))
}

/**
 * 计算文档与查询的匹配分数
 * 使用关键词匹配 + Jaccard 相似度
 */
function calculateScore(
  queryTokens: string[],
  entry: KnowledgeIndexEntry,
): number {
  if (queryTokens.length === 0) return 0

  const docKeywords = entry.keywords.map(k => k.toLowerCase())

  // 1. 关键词匹配计数
  let matchCount = 0
  let exactMatchCount = 0

  for (const token of queryTokens) {
    const lowerToken = token.toLowerCase()

    // 精确匹配文档关键词
    if (docKeywords.includes(lowerToken)) {
      matchCount += 2
      exactMatchCount++
      continue
    }

    // 部分匹配（查询词是文档关键词的子串）
    for (const keyword of docKeywords) {
      if (keyword.includes(lowerToken) || lowerToken.includes(keyword)) {
        matchCount += 1
        break
      }
    }
  }

  // 2. Jaccard 相似度
  const querySet = new Set(queryTokens)
  const docSet = new Set(docKeywords)
  const intersection = new Set([...querySet].filter(x => docSet.has(x)))
  const union = new Set([...querySet, ...docSet])
  const jaccard = union.size > 0 ? intersection.size / union.size : 0

  // 3. 综合分数 = 关键词匹配 + Jaccard 相似度 + 精确匹配加成
  const matchScore = matchCount / Math.max(queryTokens.length, 1)
  const exactBonus = exactMatchCount > 0 ? exactMatchCount * 0.5 : 0
  const weightBonus = entry.weight / 10 // 权重因子 (0.5-1.0)

  return (matchScore + jaccard * 2 + exactBonus) * weightBonus
}

/**
 * 读取知识库文件内容
 */
function readFileContent(relativePath: string): string {
  const fullPath = path.join(KNOWLEDGE_BASE_DIR, relativePath)
  try {
    if (!fs.existsSync(fullPath)) return ''
    return fs.readFileSync(fullPath, 'utf-8')
  } catch {
    return ''
  }
}

/**
 * 加载索引
 */
function loadIndex(): KnowledgeIndex | null {
  try {
    if (!fs.existsSync(INDEX_FILE)) {
      console.warn('[LocalFileRAG] 索引文件不存在，请先运行 build-index.js')
      return null
    }
    const raw = fs.readFileSync(INDEX_FILE, 'utf-8')
    return JSON.parse(raw) as KnowledgeIndex
  } catch (err) {
    console.error('[LocalFileRAG] 加载索引失败:', err)
    return null
  }
}

/**
 * 从知识库中检索最相关的文档
 *
 * @param query - 用户查询文本
 * @param topK - 返回结果数量，默认 5
 * @param options - 检索选项
 * @returns 按相关度排序的文档列表
 */
export function retrieve(
  query: string,
  topK: number = 5,
  options: Partial<RetrievalOptions> = {},
): RetrievalResult[] {
  const { minScore = 0, includeContent = true } = options

  const index = loadIndex()
  if (!index || !index.files || index.files.length === 0) {
    return []
  }

  // 对查询分词
  const queryTokens = tokenize(query)

  // 计算每个文档的分数
  const scored: RetrievalResult[] = index.files
    .map(entry => {
      const score = calculateScore(queryTokens, entry)
      return {
        path: entry.path,
        title: entry.title,
        content: includeContent ? readFileContent(entry.path) : '',
        score,
        weight: entry.weight,
        keywords: entry.keywords,
      }
    })
    .filter(r => r.score >= minScore)

  // 按分数降序排序
  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, topK)
}

/**
 * 按类别检索（只检索特定类型的文档）
 *
 * @param query - 查询文本
 * @param category - 类别：'specs' | 'templates' | 'references' | 'all'
 * @param topK - 返回数量
 */
export function retrieveByCategory(
  query: string,
  category: 'specs' | 'templates' | 'references' | 'all' = 'all',
  topK: number = 5,
): RetrievalResult[] {
  const results = retrieve(query, Math.max(topK * 3, 15), { includeContent: true })

  if (category === 'all') {
    return results.slice(0, topK)
  }

  const categoryPrefix: Record<string, string> = {
    specs: 'project-specs/',
    templates: 'code-templates/',
    references: 'reference-modules/',
  }

  const prefix = categoryPrefix[category]
  if (!prefix) return results.slice(0, topK)

  return results.filter(r => r.path.startsWith(prefix)).slice(0, topK)
}

/**
 * 获取知识库统计信息
 */
export function getStats() {
  const index = loadIndex()
  if (!index) {
    return { totalFiles: 0, categories: {}, lastUpdated: null }
  }

  const categories: Record<string, number> = {}
  for (const file of index.files) {
    const cat = file.path.split('/')[0] || 'other'
    categories[cat] = (categories[cat] || 0) + 1
  }

  return {
    totalFiles: index.totalFiles,
    categories,
    lastUpdated: index.generatedAt,
  }
}

/**
 * 重新构建索引（调用 build-index.js）
 * 注意：需要 Node.js 支持 child_process，仅在服务端环境可用
 */
export async function rebuildIndex(): Promise<{ success: boolean; message: string }> {
  const buildScript = path.join(KNOWLEDGE_BASE_DIR, 'build-index.js')
  try {
    if (!fs.existsSync(buildScript)) {
      return { success: false, message: '构建脚本不存在: build-index.js' }
    }
    const { execSync } = await import('child_process')
    execSync(`node "${buildScript}"`, {
      cwd: path.dirname(KNOWLEDGE_BASE_DIR),
      stdio: 'pipe',
    })
    return { success: true, message: '索引已重新构建' }
  } catch (err: any) {
    return { success: false, message: `构建失败: ${err.message}` }
  }
}

export default { retrieve, retrieveByCategory, getStats, rebuildIndex }