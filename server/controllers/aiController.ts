/**
 * AI 助手 Controller
 *
 * 职责：处理 AI 相关 API 请求，调用 AIAssistant 服务
 */

import type { Request, Response, NextFunction } from 'express'
import config from '../config/index.js'
import * as aiAssistantService from '../services/AIAssistant.js'
import * as codeInjectorService from '../services/CodeInjector.js'
import { getStats } from '../services/LocalFileRAG.js'
import { logOperation } from '../utils/logger.js'
import { incrUsage } from '../modules/billing/services/usageService.js'

/** 上游调用一旦发出就已产生成本，无论返回成败都计入租户当日用量 */
function meterApiCall(req: Request): void {
  const tenantId = req.user?.tenantId
  if (tenantId) incrUsage(tenantId, 'apiCalls').catch(() => {})
}

/**
 * 检查配置状态
 * GET /api/ai/status
 */
export const status = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiCheck = await aiAssistantService.checkConfig()
    const kbStats = getStats()
    res.json({
      code: 0,
      data: {
        apiConfigured: apiCheck.valid,
        message: apiCheck.message,
        knowledgeBase: kbStats,
        injectorEnabled: config.app.aiAssistantEnabled === true,
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * 生成代码对话（核心接口）
 * POST /api/ai/chat
 */
export const chat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, model, history, providerId } = req.body

    if (history && history.length > 0) {
      const result = await aiAssistantService.chat(message, history, providerId, model)
      meterApiCall(req)
      if (result.success) {
        res.json({
          code: 0,
          data: { content: result.content },
        })
      } else {
        res.status(500).json({ code: 1, message: result.error })
      }
      return
    }

    const result = await aiAssistantService.generateCode(message, providerId, model)
    meterApiCall(req)
    logOperation(
      req,
      'generate-code',
      'ai-assistant',
      JSON.stringify({
        prompt: message.substring(0, 100),
        fileCount: result.files.length,
        success: result.success,
        tokens: result.usage?.totalTokens,
      }),
    )

    if (result.success) {
      res.json({
        code: 0,
        data: {
          prompt: result.prompt,
          explanation: result.explanation,
          files: result.files,
          usage: result.usage,
        },
      })
    } else {
      res.status(500).json({ code: 1, message: result.error })
    }
  } catch (err) {
    next(err)
  }
}

/**
 * 将生成的代码应用到项目
 * POST /api/ai/apply
 */
export const apply = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { files, rollback } = req.body
    const userId = req.user?.id || 0

    let result
    if (rollback) {
      result = codeInjectorService.rollback()
    } else {
      result = await codeInjectorService.apply(files, userId)
    }

    logOperation('ai-assistant', rollback ? 'rollback' : 'apply-code', {
      fileCount: files.length,
      success: result.success,
      appliedCount: result.appliedFiles?.length,
    })

    if (result.success) {
      res.json({
        code: 0,
        data: {
          success: result.success,
          appliedFiles: result.appliedFiles,
          skippedFiles: result.skippedFiles,
          createdMenuIds: result.createdMenuIds,
          createdPermissions: result.createdPermissions,
          message: result.message,
        },
      })
    } else {
      res.status(400).json({ code: 1, message: result.message })
    }
  } catch (err) {
    next(err)
  }
}

/**
 * 重建知识库索引
 * POST /api/ai/rebuild-index
 */
export const rebuildIndex = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rebuildIndex } = await import('../services/LocalFileRAG.js')
    const result = await rebuildIndex()
    if (result.success) {
      res.json({ code: 0, data: result })
    } else {
      res.status(500).json({ code: 1, message: result.message })
    }
  } catch (err) {
    next(err)
  }
}
