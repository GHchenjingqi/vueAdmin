import type { Request, Response, NextFunction } from 'express'
import * as priceService from '../services/priceService.js'
import * as rateService from '../services/rateService.js'

// ==================== 价格 ====================

/** SKU 价格列表 */
export const listBySku = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await priceService.listPricesBySku(Number(req.params.skuId))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** SKU 价格 upsert（按币种） */
export const upsert = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await priceService.upsertPrice(Number(req.params.skuId), req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await priceService.deletePrice(Number(req.params.skuId), String(req.params.currency))
    res.json({ code: 0, data: null })
  } catch (err) {
    next(err)
  }
}

// ==================== 汇率快照 ====================

export const saveSnapshot = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await rateService.saveRateSnapshot(req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const getSnapshot = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const base = String(req.query.base || 'USD')
    const date = req.query.date ? String(req.query.date) : undefined
    const data = await rateService.getSnapshot(base, date)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const listSnapshots = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await rateService.listSnapshots(req.query as never)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}
