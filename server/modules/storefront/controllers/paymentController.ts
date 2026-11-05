import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import { getSite } from '../middleware/siteContext.js'
import * as paymentService from '../services/paymentService.js'
import * as monitoring from '../services/monitoringService.js'
import type { CreatePaymentSessionInput } from '../../../shared/schemas/storefront.js'

export const createSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const body = req.body as CreatePaymentSessionInput
    if (!Number.isInteger(body.orderId)) throw new AppError(400, 'orderId 不合法')
    const data = await paymentService.createSession(site, body.orderId)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 支付 Webhook 回调（provider 在路径参数中给出）。
 * 路由层已用 express.raw 保留原始 body 以用于验签；此处 req.body 为 Buffer。
 */
export const webhook = async (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now()
  try {
    const provider = String(req.params.provider ?? 'mock')
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}))
    const signature = req.header('x-mock-signature') || req.header('x-signature')
    const result = await paymentService.handleWebhook(provider, rawBody, signature)
    // P4-T13：webhook 处理延迟观测（P95 告警）
    monitoring.recordLatency('webhook_latency_ms', Date.now() - startedAt)
    res.status(result.status).json({ code: result.ok ? 0 : result.status, message: result.message ?? 'ok', alreadyProcessed: result.alreadyProcessed ?? false })
  } catch (err) {
    monitoring.recordLatency('webhook_latency_ms', Date.now() - startedAt)
    next(err)
  }
}
