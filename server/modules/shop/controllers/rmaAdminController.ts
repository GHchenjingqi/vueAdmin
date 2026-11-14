import type { Request, Response, NextFunction } from 'express'
import * as rmaAdminService from '../services/rmaAdminService.js'
import { recordAdminAction } from '../services/auditLogService.js'
import type { RmaRejectInput } from '../../../shared/schemas/shop.js'
import { queryInt, queryStr } from '../utils/query.js'

/** GET /shop/rmas —— 后台退货申请列表（status/orderId 过滤，分页） */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      code: 0,
      data: await rmaAdminService.listRmas({
        status: queryStr(req.query.status),
        orderId: queryInt(req.query.orderId),
        limit: queryInt(req.query.limit),
        offset: queryInt(req.query.offset),
      }),
    })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/rmas/:id/approve —— 审核通过（仅 pending） */
export const approve = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await rmaAdminService.approveRma(Number(req.params.id))
    await recordAdminAction(req, 'rma.approved', 'refund', Number(req.params.id) || null, { status: 'approved' })
    res.json({ code: 0, data: row })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/rmas/:id/reject —— 审核驳回（仅 pending，必须附原因） */
export const reject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as RmaRejectInput
    const row = await rmaAdminService.rejectRma(Number(req.params.id), body.rejectReason)
    await recordAdminAction(req, 'rma.rejected', 'refund', Number(req.params.id) || null, { status: 'rejected' })
    res.json({ code: 0, data: row })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/rmas/:id/refund —— 批准并退款（PLAN 4.2，支持部分退款） */
export const approveWithRefund = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body ?? {}) as { amountCents?: number; reason?: string }
    const result = await rmaAdminService.approveRmaWithRefund(Number(req.params.id), {
      amountCents: typeof body.amountCents === 'number' ? body.amountCents : undefined,
      reason: body.reason,
    })
    await recordAdminAction(req, 'rma.refunded', 'refund', Number(req.params.id) || null, {
      status: 'refunded',
      refundNo: result.refund.refundNo,
      amountCents: result.refund.amountCents,
    })
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/rmas/:id/exchange —— 转为换货（PLAN 4.2，不触发退款） */
export const approveAsExchange = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body ?? {}) as { note?: string }
    const row = await rmaAdminService.approveRmaAsExchange(Number(req.params.id), body.note)
    await recordAdminAction(req, 'rma.exchange', 'refund', Number(req.params.id) || null, { status: 'exchange' })
    res.json({ code: 0, data: row })
  } catch (err) {
    next(err)
  }
}
