import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import { getSite } from '../middleware/siteContext.js'
import * as paymentService from '../services/paymentService.js'
import * as monitoring from '../services/monitoringService.js'
import { listProviders, publicProvider } from '../payments/providerRegistry.js'
import { getGateway } from '../payments/gatewayRegistry.js'
import type { CreatePaymentSessionInput } from '../../../shared/schemas/storefront.js'
import * as checkoutService from '../services/checkoutService.js'
import { verifyReturnToken } from '../services/paymentService.js'

export const createSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const body = req.body as CreatePaymentSessionInput
    if (!Number.isInteger(body.orderId)) throw new AppError(400, 'orderId 不合法')
    const data = await paymentService.createSession(site, body.orderId, body.provider)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * P5-T03：列出当前可用支付方式（flag 开启 + 可选币种能力过滤），
 * 供结算页渲染支付方式列表（BNPL 在 flag 开启后才出现）。公开安全投影，不泄漏内部字段。
 */
export const listPaymentProviders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currency = typeof req.query.currency === 'string' ? req.query.currency : undefined
    const data = (await listProviders(currency)).map(publicProvider)
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
    const result = await paymentService.handleWebhook(provider, rawBody, signature, req.headers)
    // P4-T13：webhook 处理延迟观测（P95 告警）
    monitoring.recordLatency('webhook_latency_ms', Date.now() - startedAt)
    if (result.ok) {
      // 支付宝要求纯文本 success、微信要求 JSON SUCCESS，否则网关会持续重投
      const ack = getGateway(provider)?.successResponse?.()
      if (ack) {
        res.status(200).type(ack.contentType).send(ack.body)
        return
      }
    }
    res.status(result.status).json({ code: result.ok ? 0 : result.status, message: result.message ?? 'ok', alreadyProcessed: result.alreadyProcessed ?? false })
  } catch (err) {
    monitoring.recordLatency('webhook_latency_ms', Date.now() - startedAt)
    next(err)
  }
}

/**
 * 网关要求用户在回跳后由服务端主动确认（如 PayPal capture）。
 * 必须由回跳凭证授权（避免无鉴权 capture 被滥用），成功后幂等落到订单状态机。
 */
export const capturePayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderNo, provider, returnToken } = req.body as { orderNo?: string; provider?: string; returnToken?: string }
    if (!orderNo || !provider || !returnToken) throw new AppError(400, '缺少 orderNo / provider / returnToken')
    const parsed = verifyReturnToken(returnToken)
    if (!parsed || parsed.orderNo !== orderNo || parsed.provider !== provider) {
      throw new AppError(401, '回跳凭证无效')
    }
    const result = await paymentService.capturePayment(orderNo, provider)
    res.status(result.status).json({ code: result.ok ? 0 : result.status, message: result.message ?? 'ok', alreadyProcessed: result.alreadyProcessed ?? false })
  } catch (err) {
    next(err)
  }
}

/**
 * 网关跳转回结果页时只带 orderNo+provider（无 accessToken），凭回跳凭证换取订单只读状态。
 * 凭证无效 / 过期 / 不匹配返回 data:null，由前端按「未找到」处理。
 */
export const orderByReturnToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = String(req.params.token ?? '')
    const order = await checkoutService.getOrderByReturnToken(token)
    res.json({ code: 0, data: order })
  } catch (err) {
    next(err)
  }
}
