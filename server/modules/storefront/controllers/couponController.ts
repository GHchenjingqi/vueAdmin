import type { NextFunction, Request, Response } from 'express'
import { listAvailableCoupons } from '../services/couponService.js'

/** C 端：当前顾客可领用的优惠券列表（需登录） */
export const listAvailable = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const customerId = req.customer?.customerId
    const data = await listAvailableCoupons(customerId)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
