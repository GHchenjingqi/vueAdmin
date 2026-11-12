import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import * as commissionService from '../services/referralCommissionService.js'

export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page, pageSize, status } = req.query as Record<string, string | undefined>
    const data = await commissionService.listCommissions({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status: status as 'pending' | 'settled' | 'void' | undefined,
    })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const settle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const { status } = req.body as { status?: string }
    if (!['settled', 'void'].includes(status ?? '')) {
      throw new AppError(400, 'INVALID_COMMISSION_STATUS')
    }
    const row = await commissionService.settleCommission(id, status as 'settled' | 'void')
    res.json({ code: 0, data: row })
  } catch (err) {
    next(err)
  }
}
