#!/usr/bin/env node
/**
 * 知识库索引初始化脚本
 *
 * 功能：
 * - 扫描 .ai-knowledge/ 下所有文件
 * - 提取关键词建立索引
 * - 写入 knowledge-index.json
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..', '.ai-knowledge')

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

/**
 * 从文件内容提取关键词
 */
function extractKeywords(content: string, filePath: string): string[] {
  const keywords = new Set<string>()
  const lowerContent = content.toLowerCase()

  // 按目录分类增加关键词
  if (filePath.startsWith('project-specs/')) {
    keywords.add('规范')
    keywords.add('coding-standards')
    keywords.add('code-style')
    if (filePath.includes('代码规范')) {
      keywords.add('代码规范')
      keywords.add('coding')
      keywords.add('typescript')
    }
    if (filePath.includes('API')) {
      keywords.add('api')
      keywords.add('rest')
      keywords.add('接口')
    }
    if (filePath.includes('数据库')) {
      keywords.add('数据库')
      keywords.add('mysql')
      keywords.add('sequelize')
    }
    if (filePath.includes('前端')) {
      keywords.add('前端')
      keywords.add('vue')
      keywords.add('component')
    }
    if (filePath.includes('目录结构')) {
      keywords.add('目录结构')
      keywords.add('项目结构')
      keywords.add('architecture')
    }
  } else if (filePath.startsWith('code-templates/')) {
    keywords.add('模板')
    keywords.add('template')
    keywords.add('code-generation')
    if (filePath.includes('backend')) {
      keywords.add('后端')
      keywords.add('express')
    }
    if (filePath.includes('frontend')) {
      keywords.add('前端')
      keywords.add('vue')
    }
  } else if (filePath.startsWith('reference-modules/')) {
    keywords.add('示例')
    keywords.add('reference')
    keywords.add('example')
    if (filePath.includes('user')) {
      keywords.add('user')
      keywords.add('用户管理')
      keywords.add('crud')
    }
  }

  // 从内容提取关键词
  const words = lowerContent.match(/[\w\u4e00-\u9fa5]+/g) || []
  const stopWords = new Set([
    'the', 'and', 'for', 'that', 'with', 'have', 'this', 'from', 'your', 'are',
    '使用', '这个', '可以', '需要', '必须', '不能', '就是', '如果', '因为', '所以',
  ])

  words.forEach(word => {
    if (word.length > 1 && !stopWords.has(word) && !stopWords.has(word.toLowerCase())) {
      keywords.add(word)
    }
  })

  return Array.from(keywords)
}

/**
 * 计算文件权重
 */
function calculateWeight(filePath: string): number {
  if (filePath.startsWith('project-specs/')) {
    // 项目规范权重高
    return 10
  } else if (filePath.startsWith('code-templates/')) {
    // 代码模板权重中等
    return 8
  } else if (filePath.startsWith('reference-modules/')) {
    // 参考模块权重高
    return 9
  }
  return 5
}

/**
 * 递归扫描目录
 */
function scanDirectory(dir: string, basePath: string): KnowledgeIndexEntry[] {
  const entries: KnowledgeIndexEntry[] = []
  const files = fs.readdirSync(dir)

  for (const file of files) {
    const fullPath = path.join(dir, file)
    const relativePath = path.relative(ROOT_DIR, fullPath)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      entries.push(...scanDirectory(fullPath, basePath))
    } else {
      // 跳过 .gitkeep, index.json, 空文件
      if (file === '.gitkeep' || file === 'knowledge-index.json' || stat.size === 0) {
        continue
      }

      const content = fs.readFileSync(fullPath, 'utf-8')
      const keywords = extractKeywords(content, relativePath)
      const weight = calculateWeight(relativePath)

      entries.push({
        path: relativePath,
        title: file.replace(/\.[^/.]+$/, ''),
        keywords,
        weight,
        size: stat.size,
      })
    }
  }

  return entries
}

function main() {
  console.log('开始扫描知识库...')

  if (!fs.existsSync(ROOT_DIR)) {
    console.error(`知识库目录不存在: ${ROOT_DIR}`)
    process.exit(1)
  }

  const files = scanDirectory(ROOT_DIR, ROOT_DIR)
  const index: KnowledgeIndex = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    totalFiles: files.length,
    files,
  }

  const outputPath = path.join(ROOT_DIR, 'knowledge-index.json')
  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2), 'utf-8')

  console.log(`索引生成完成，共 ${files.length} 个文件`)
  console.log(`输出路径: ${outputPath}`)

  files.forEach(f => {
    console.log(`  - ${f.path} (${f.keywords.length} keywords, weight: ${f.weight})`)
  })
}

main()