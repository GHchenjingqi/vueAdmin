/**
 * AI 助手服务
 *
 * 职责：集成 AI API（支持 DeepSeek、OpenAI 等多提供商），
 * 结合本地 RAG 知识库生成符合项目规范的全栈代码
 */

import OpenAI from 'openai'
import { retrieveByCategory } from './LocalFileRAG.js'
import * as aiProviderService from './AiProviderService.js'
import type { RetrievalResult } from './LocalFileRAG.js'

// 默认模型常量
const DEFAULT_MODEL = 'deepseek-chat'
const MAX_TOKENS = 8192

// 生成代码文件结构定义
export interface GeneratedCodeFile {
  path: string
  content: string
  language: string
  description: string
  isNew: boolean
}

// 生成结果定义
export interface GenerationResult {
  success: boolean
  prompt: string
  files: GeneratedCodeFile[]
  explanation: string
  error?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * 获取 AI 客户端配置
 * 优先使用指定 providerId，否则使用默认启用的提供商
 */
async function getClientConfig(providerId?: number): Promise<{ client: OpenAI; model: string }> {
  let apiBaseUrl: string
  let apiKey: string
  let defaultModel: string

  if (providerId) {
    // 使用指定提供商
    const provider = await aiProviderService.getFullConfig(providerId)
    apiBaseUrl = provider.apiBaseUrl
    apiKey = provider.apiKey
    defaultModel = provider.defaultModel
  } else {
    // 尝试获取默认启用的提供商
    const defaultProvider = await aiProviderService.getDefaultProvider()

    if (defaultProvider) {
      apiBaseUrl = defaultProvider.apiBaseUrl
      apiKey = defaultProvider.apiKey
      defaultModel = defaultProvider.defaultModel
    } else {
      // 回退到环境变量配置
      apiKey = process.env.DEEPSEEK_API_KEY || ''
      if (!apiKey) {
        throw new Error('未配置任何 AI 提供商，请在「AI 提供商管理」中添加配置，或在 .env 文件中设置 DEEPSEEK_API_KEY')
      }
      apiBaseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
      defaultModel = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL
    }
  }

  const client = new OpenAI({
    baseURL: normalizeBaseUrl(apiBaseUrl),
    apiKey,
  })

  return { client, model: defaultModel }
}

/**
 * 规范化 API Base URL，确保以 /v1 结尾
 * 处理各种用户输入：https://api.example.com, https://api.example.com/v1, https://api.example.com/v1/llm 等
 */
function normalizeBaseUrl(url: string): string {
  let trimmed = url.replace(/\/+$/, '')
  // 去掉用户多余的 /chat/completions（OpenAI SDK 会自动追加）
  trimmed = trimmed.replace(/\/chat\/completions$/, '')
  // 路径中已经包含 /v1（如 /v1/llm），不再追加
  if (trimmed.includes('/v1')) {
    return trimmed
  }
  return `${trimmed}/v1`
}

/**
 * 构建系统提示词
 * 整合从 RAG 检索到的项目规范、代码模板和参考示例
 */
function buildSystemPrompt(query: string): string {
  // 从知识库检索相关内容
  const specs = retrieveByCategory(query, 'specs', 3)
  const templates = retrieveByCategory(query, 'templates', 4)
  const references = retrieveByCategory(query, 'references', 3)

  let systemPrompt = `你是一个经验丰富的全栈开发工程师，精通 Vue 3 + TypeScript + Express + Sequelize 技术栈。

你的任务是：根据用户的功能需求，严格遵循给定的项目规范，生成符合项目架构的全栈代码。

必须严格遵守以下要求：
1. **必须**完全遵循提供的项目编码规范、API 设计规范、数据库规范
2. **必须**使用项目现有的代码风格、命名习惯、目录结构
3. **必须**参考提供的代码模板和参考示例的结构
4. **只输出最终可用的代码**，不要解释你的思考过程，不要说"好的"、"明白了"等废话
5. 输出格式必须是 JSON，包含以下字段：
   - explanation: 简要说明你的实现思路和生成的文件功能（中文）
   - files: 代码文件数组，每个文件包含：
     - path: 文件的完整相对路径（如 "server/controllers/articleController.ts"）
     - content: 文件的完整代码内容
     - language: 编程语言（ts / vue / js 等）
     - description: 文件功能说明
     - isNew: 是否为新文件（true 新建，false 修改已有文件）
6. 确保生成的代码**可以直接使用**，不要留 TODO 或占位符（除非需要开发者手动填写配置）
7. 如果是修改已有文件，要保留原有代码的结构和注释，只修改需要修改的部分
`

  // 添加检索到的项目规范
  if (specs.length > 0) {
    systemPrompt += `

## 项目规范（必须严格遵守）
`
    specs.forEach((doc: RetrievalResult, i: number) => {
      systemPrompt += `\n---\n### ${i + 1}. ${doc.title}\n${doc.content}\n`
    })
  }

  // 添加代码模板
  if (templates.length > 0) {
    systemPrompt += `

## 代码模板（遵循此结构）
`
    templates.forEach((doc: RetrievalResult, i: number) => {
      systemPrompt += `\n---\n### ${i + 1}. ${doc.path}\n${doc.content}\n`
    })
  }

  // 添加参考示例
  if (references.length > 0) {
    systemPrompt += `

## 参考示例（参考此代码风格）
`
    references.forEach((doc: RetrievalResult, i: number) => {
      systemPrompt += `\n---\n### ${i + 1}. ${doc.path}\n${doc.content}\n`
    })
  }

  systemPrompt += `

现在，请根据用户的需求，生成完整代码，输出严格按照要求的 JSON 格式。
记住：只输出 JSON，不要其他文字说明，所有说明放在 explanation 字段中。
`

  return systemPrompt
}

/**
 * 解析 AI 返回的 JSON 结果
 * 处理可能的 markdown 包裹问题
 */
function parseAIResponse(response: string): GenerationResult {
  try {
    // 去除可能的 markdown 代码块
    let cleaned = response.trim()
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }

    const parsed = JSON.parse(cleaned)

    // 验证结构
    if (!parsed.files || !Array.isArray(parsed.files)) {
      throw new Error('返回结果中 files 数组不存在')
    }

    return {
      success: true,
      prompt: '',
      explanation: parsed.explanation || '',
      files: parsed.files.map((f: any) => ({
        path: f.path || '',
        content: f.content || '',
        language: f.language || 'text',
        description: f.description || '',
        isNew: Boolean(f.isNew),
      })),
    }
  } catch (err: any) {
    return {
      success: false,
      prompt: '',
      explanation: '',
      files: [],
      error: `解析响应失败: ${err.message}`,
    }
  }
}

/**
 * 生成代码主入口
 *
 * @param userPrompt - 用户功能需求描述
 * @param providerId - 可选，指定 AI 提供商 ID
 * @param model - 可选，指定模型，默认使用提供商的 defaultModel
 */
export async function generateCode(
  userPrompt: string,
  providerId?: number,
  model?: string,
): Promise<GenerationResult> {
  if (!userPrompt || userPrompt.trim().length < 1) {
    return {
      success: false,
      prompt: userPrompt,
      explanation: '',
      files: [],
      error: '需求描述不能为空',
    }
  }

  try {
    const { client, model: defaultModel } = await getClientConfig(providerId)
    const systemPrompt = buildSystemPrompt(userPrompt)
    const selectedModel = model || defaultModel

    const response = await client.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3, // 低温度，保持一致性
      max_tokens: MAX_TOKENS,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return {
        success: false,
        prompt: userPrompt,
        explanation: '',
        files: [],
        error: 'AI API 返回空内容',
      }
    }

    const result = parseAIResponse(content)
    result.prompt = userPrompt

    // 添加使用量统计
    if (response.usage) {
      result.usage = {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      }
    }

    return result
  } catch (err: any) {
    console.error('[AIAssistant] 生成代码失败:', err)
    return {
      success: false,
      prompt: userPrompt,
      explanation: '',
      files: [],
      error: `API 调用失败: ${err.message}`,
    }
  }
}

/**
 * 简单对话（不生成代码，只是问答）
 */
export async function chat(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant', content: string }> = [],
  providerId?: number,
  model?: string,
): Promise<{ success: boolean, content: string, error?: string }> {
  try {
    const { client, model: defaultModel } = await getClientConfig(providerId)
    const selectedModel = model || defaultModel

    const messages = [
      {
        role: 'system' as const,
        content: '你是项目内置的 AI 助手，基于项目代码库提供技术帮助。回答简洁专业，用中文。',
      },
      ...history,
      { role: 'user' as const, content: userMessage },
    ]

    const response = await client.chat.completions.create({
      model: selectedModel,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    })

    const content = response.choices[0]?.message?.content || ''
    return { success: true, content }
  } catch (err: any) {
    console.error('[AIAssistant] 对话失败:', err)
    return { success: false, content: '', error: err.message }
  }
}

/**
 * 检查 API 配置是否有效
 */
export async function checkConfig(): Promise<{ valid: boolean, message: string }> {
  try {
    const defaultProvider = await aiProviderService.getDefaultProvider()
    if (defaultProvider) {
      return { valid: true, message: `已配置 AI 提供商「${defaultProvider.name}」` }
    }

    return { valid: false, message: '未配置任何 AI 提供商，请在「AI 提供商管理」中添加并启用一个提供商' }
  } catch (err: any) {
    return { valid: false, message: err.message }
  }
}

export default {
  generateCode,
  chat,
  checkConfig,
}