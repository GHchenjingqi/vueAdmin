import type { Request, Response, NextFunction } from 'express'
import * as refundService from '../services/refundService.js'
import type { CreateRefundInput } from '../../../shared/schemas/shop.js'

/** POST /shop/orders/:id/refunds —— 创建退款（幂等） */
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as CreateRefundInput
    const data = await refundService.createRefund({
      orderId: Number(req.params.id),
      amountCents: body.amountCents,
      reason: body.reason,
      idempotencyKey: body.idempotencyKey,
      currency: body.currency,
    })
    res.status(201).json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** GET /shop/orders/:id/refunds —— 退款流水 */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await refundService.listRefunds(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}
