import type { NextFunction, Request, Response } from 'express'
import * as channelService from '../services/notificationChannelService.js'
import type { ChannelInput, ChannelType } from '../services/notificationChannelService.js'
import { AppError } from '../middleware/errorHandler.js'

/** 通知渠道管理控制器（P2-11） */
function parseId(req: Request): number {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, '渠道 ID 不合法')
  return id
}

function parseType(value: unknown): ChannelType | undefined {
  return typeof value === 'string' && ['email', 'sms', 'webhook'].includes(value)
    ? (value as ChannelType)
    : undefined
}

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await channelService.listChannels({
      keyword: typeof req.query.keyword === 'string' ? req.query.keyword : undefined,
      type: parseType(req.query.type),
      enabled: req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined,
    })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** 已启用渠道精简清单（供个人中心通知偏好使用，不含配置） */
export const active = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ code: 0, data: await channelService.listActiveChannels() })
  } catch (err) {
    next(err)
  }
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await channelService.createChannel((req.body ?? {}) as ChannelInput)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await channelService.updateChannel(parseId(req), (req.body ?? {}) as ChannelInput)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await channelService.removeChannel(parseId(req))
    res.json({ code: 0, data: null })
  } catch (err) {
    next(err)
  }
}

export const toggle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const enabled = Boolean((req.body as { enabled?: unknown } | undefined)?.enabled)
    const data = await channelService.toggleChannel(parseId(req), enabled)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const test = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await channelService.testChannel(parseId(req))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
