import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import { getSite } from '../middleware/siteContext.js'
import * as cartService from '../services/cartService.js'
import type { CartAddInput, CartUpdateInput } from '../../../shared/schemas/storefront.js'

/** 从请求提取游客购物车 token：优先 X-Cart-Token 头，回退 cookie */
function extractCartToken(req: Request): string | undefined {
  const fromHeader = req.header('x-cart-token')
  if (fromHeader && fromHeader.length <= 64) return fromHeader
  const fromCookie = (req.cookies as Record<string, string> | undefined)?.cart_token
  return fromCookie && fromCookie.length <= 64 ? fromCookie : undefined
}

/** 将购物车 token 写回（Set-Cookie + 响应体），便于游客后续携带 */
function issueToken(res: Response, token: string): void {
  res.cookie('cart_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30 * 1000,
  })
}

export const getCart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = extractCartToken(req)
    const cart = token ? await cartService.getCart(token) : null
    const view = cart ? await cartService.toCartView(cart) : { token: null, currency: getSite(res).defaultCurrency, items: [] }
    res.json({ code: 0, data: view })
  } catch (err) {
    next(err)
  }
}

export const addItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const body = req.body as CartAddInput
    if (!Number.isInteger(body.skuId) || !Number.isInteger(body.qty) || body.qty < 1) {
      throw new AppError(400, 'skuId / qty 不合法')
    }
    const token = extractCartToken(req)
    const customerId = req.customer?.customerId
    const cart = await cartService.addItem(site, token, { skuId: body.skuId, qty: body.qty }, customerId)
    issueToken(res, cart.token)
    const view = await cartService.toCartView(cart)
    res.json({ code: 0, data: view })
  } catch (err) {
    next(err)
  }
}

export const updateItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const site = getSite(res)
    const body = req.body as CartUpdateInput
    const token = extractCartToken(req)
    if (!Number.isInteger(body.qty) || body.qty < 1) throw new AppError(400, 'qty 不合法')
    const cart = await cartService.updateItemQty(site, token as string, Number(req.params.id), body.qty)
    const view = await cartService.toCartView(cart)
    res.json({ code: 0, data: view })
  } catch (err) {
    next(err)
  }
}

export const removeItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = extractCartToken(req)
    const cart = await cartService.removeItem(token as string, Number(req.params.id))
    const view = await cartService.toCartView(cart)
    res.json({ code: 0, data: view })
  } catch (err) {
    next(err)
  }
}
