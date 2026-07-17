/**
 * AI 提供商管理 Controller
 *
 * 职责：处理 AI 提供商相关的 CRUD API 请求
 */

import type { Request, Response, NextFunction } from 'express'
import * as aiProviderService from '../services/AiProviderService.js'

/**
 * 获取 AI 提供商列表
 * GET /api/ai/providers
 */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { enabled, keyword } = req.query as any
    const providers = await aiProviderService.getList({ enabled, keyword })
    res.json({ code: 0, data: providers })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取启用的 AI 提供商列表（简洁版，供前端选择器使用）
 * GET /api/ai/providers/enabled
 */
export const enabledList = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const providers = await aiProviderService.getEnabledList()
    res.json({ code: 0, data: providers })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取单个 AI 提供商详情
 * GET /api/ai/providers/:id
 * 支持 ?includeKey=1 返回完整 API Key（编辑时使用）
 */
export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id)
    const includeKey = req.query.includeKey === '1'

    if (includeKey) {
      const provider = await aiProviderService.getFullConfig(id)
      res.json({
        code: 0,
        data: {
          id: provider.id,
          name: provider.name,
          apiBaseUrl: provider.apiBaseUrl,
          apiKey: provider.apiKey,
          models: provider.models,
          defaultModel: provider.defaultModel,
          enabled: provider.enabled,
          sort: provider.sort,
          description: provider.description,
          createdAt: provider.createdAt,
          updatedAt: provider.updatedAt,
        },
      })
    } else {
      const provider = await aiProviderService.getById(id)
      res.json({ code: 0, data: provider })
    }
  } catch (err: any) {
    if (err.message === 'AI 提供商不存在') {
      res.status(404).json({ code: 1, message: err.message })
    } else {
      next(err)
    }
  }
}

/**
 * 创建 AI 提供商
 * POST /api/ai/providers
 */
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = await aiProviderService.create(req.body)
    res.status(201).json({ code: 0, data: provider })
  } catch (err: any) {
    if (err.message?.includes('已存在')) {
      res.status(409).json({ code: 1, message: err.message })
    } else {
      next(err)
    }
  }
}

/**
 * 更新 AI 提供商
 * PUT /api/ai/providers/:id
 */
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id)
    const provider = await aiProviderService.update(id, req.body)
    res.json({ code: 0, data: provider })
  } catch (err: any) {
    if (err.message === 'AI 提供商不存在') {
      res.status(404).json({ code: 1, message: err.message })
    } else if (err.message?.includes('已存在')) {
      res.status(409).json({ code: 1, message: err.message })
    } else {
      next(err)
    }
  }
}

/**
 * 删除 AI 提供商
 * DELETE /api/ai/providers/:id
 */
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id)
    await aiProviderService.remove(id)
    res.json({ code: 0, message: '删除成功' })
  } catch (err: any) {
    if (err.message === 'AI 提供商不存在') {
      res.status(404).json({ code: 1, message: err.message })
    } else {
      next(err)
    }
  }
}