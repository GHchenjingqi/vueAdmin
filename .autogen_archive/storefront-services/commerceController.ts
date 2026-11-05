import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import { getSite } from '../middleware/siteContext.js'
import { getActiveCurrency } from '../services/currencyConfig.js'
import { COOKIE_NAME, CART_TTL_DAYS } from '../services/cartConst.js'
import * as cartService from '../services/cartService.js'
import * as quoteService from '../services/quoteService.js'
import * as orderService from '../services/orderService.js'
import * as paymentService from '../services/paymentService.js'
import * as webhookService from '../services/webhookService.js'

/**
 * Storefront 商务控制器（P3）：cart / quote / orders / payments / webhooks。
 * 响应包裹 {code:0,data}；私有接口统一 Cache-Control: private, no-store（T-11）。
 */

function privateNoStore(res: Response): void {
  res.set('Cache-Control', 'private, no-store')
}

function ensureCartCookie(req: Request, res: Response): string {
  const existing = req.cookies?.[COOKIE_NAME]
  if (existing && typeof existing === 'string' && existing.length >= 16) return existing
  const token = cartService.newCartToken()
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: CART_TTL_DAYS * 24 * 3600 * 1000,
    path: '/',
  })
  return token
}

export const storeConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const site = getSite(res)
    const currency = await getActiveCurrency()
    // 币种为公开信息：短缓存（C8：≤60s 生效）
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=30')
    res.json({
      code: 0,
      data: { currency, market: { country: 'US', language: site.defaultLocale }, version: new Date().toISOString() },
    })
  } catch (err) {
    next(err)
  }
}

export const getCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    privateNoStore(res)
    const token = ensureCartCookie(req, res)
    const cart = await cartService.getOrCreateCart(token)
    res.json({ code: 0, data: await cartService.presentCart(cart) })
  } catch (err) {
    next(err)
  }
}

export const addCartItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    privateNoStore(res)
    const token = ensureCartCookie(req, res)
    const body = req.body as { skuId: number; qty: number }
    res.json({ code: 0, data: await cartService.addItem(token, body.skuId, body.qty) })
  } catch (err) {
    next(err)
  }
}

export const updateCartItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    privateNoStore(res)
    const token = ensureCartCookie(req, res)
    const itemId = Number(req.params.itemId)
    const body = req.body as { qty: number }
    res.json({ code: 0, data: await cartService.updateItem(token, itemId, body.qty) })
  } catch (err) {
    next(err)
  }
}

export const removeCartItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    privateNoStore(res)
    const token = ensureCartCookie(req, res)
    const itemId = Number(req.params.itemId)
    res.json({ code: 0, data: await cartService.updateItem(token, itemId, 0) })
  } catch (err) {
    next(err)
  }
}

export const quote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    privateNoStore(res)
    const token = req.cookies?.[COOKIE_NAME]
    if (!token) throw new AppError(422, 'CART_EMPTY')
    const body = req.body as { address?: Record<string, string>; couponCode?: string; shippingRateId?: string }
    res.json({ code: 0, data: await quoteService.computeQuote(token, { country: body.address?.country, couponCode: body.couponCode, shippingRateId: body.shippingRateId }) })
  } catch (err) {
    next(err)
  }
}

export const createOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    privateNoStore(res)
    const token = req.cookies?.[COOKIE_NAME]
    if (!token) throw new AppError(422, 'CART_EMPTY')
    const idempotencyKey = (req.headers['idempotency-key'] as string | undefined)?.slice(0, 64) ?? null
    const result = await orderService.createOrder(token, req.body as Record<string, unknown>, idempotencyKey)
    res.status(201).json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

export const paySession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    privateNoStore(res)
    const orderNo = req.params.orderNo
    const body = req.body as { returnUrl?: string }
    res.json({ code: 0, data: await paymentService.createPaymentSession(orderNo, body.returnUrl ?? '') })
  } catch (err) {
    next(err)
  }
}

export const getOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    privateNoStore(res)
    const token = String(req.query.t ?? '')
    res.json({ code: 0, data: await orderService.getOrderByToken(req.params.orderNo, token) })
  } catch (err) {
    next(err)
  }
}

export const webhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // 全局 express.json 已解析 body；mock 事件为纯 JSON 对象，JSON.stringify 往返字节一致。
    // 真实 Stripe 接入时需原始字节（需在 app.ts express.json 之前挂 express.raw 路由）。
    const provider = req.params.provider
    const signature = (req.headers['x-mock-signature'] ?? req.headers['stripe-signature']) as string | undefined
    const result = await webhookService.handleWebhookEvent(provider, req.body as never, signature)
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

export const mockPayPage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.set('content-type', 'text/html; charset=utf-8')
    res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Mock Payment</title></head>
<body style="font-family:sans-serif;max-width:420px;margin:60px auto;text-align:center">
<h2>Mock Payment Sandbox</h2><p>Session: ${req.params.sessionId}</p>
<form method="POST" action="/api/storefront/v1/payments/mock/${req.params.sessionId}/confirm">
<button name="outcome" value="success" style="padding:10px 24px">模拟支付成功</button>
<button name="outcome" value="failure" style="padding:10px 24px;margin-left:12px">模拟支付失败</button>
</form></body></html>`)
  } catch (err) {
    next(err)
  }
}

export const mockPayConfirm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const outcome = (req.body?.outcome ?? 'success') === 'failure' ? 'failure' : 'success'
    const result = await paymentService.confirmMockSession(req.params.sessionId, outcome)
    const payment = await (await import('../../shop/models/index.js')).ShopOrderPayment.findOne({ where: { sessionId: req.params.sessionId } })
    const returnUrl = (payment?.rawPayload as { returnUrl?: string } | null)?.returnUrl
    if (returnUrl) {
      const sep = returnUrl.includes('?') ? '&' : '?'
      res.redirect(302, `${returnUrl}${sep}order=${result.orderNo}&status=${result.status}`)
      return
    }
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}
