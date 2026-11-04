import type { Request, Response, NextFunction } from 'express'
import * as inventoryService from '../services/inventoryService.js'
import { queryInt } from '../utils/query.js'

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skuId = req.query.skuId ? queryInt(req.query.skuId) : undefined
    const warehouseId = req.query.warehouseId ? queryInt(req.query.warehouseId) : undefined
    const page = req.query.page ? queryInt(req.query.page) : undefined
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) : undefined
    res.json({ code: 0, data: await inventoryService.listInventory({ skuId, warehouseId, page, pageSize }) })
  } catch (err) {
    next(err)
  }
}

export const logs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const skuId = req.query.skuId ? queryInt(req.query.skuId) : undefined
    const warehouseId = req.query.warehouseId ? queryInt(req.query.warehouseId) : undefined
    const page = req.query.page ? queryInt(req.query.page) : undefined
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) : undefined
    res.json({ code: 0, data: await inventoryService.listLogs({ skuId, warehouseId, page, pageSize }) })
  } catch (err) {
    next(err)
  }
}

export const adjust = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { skuId, warehouseId, delta } = req.body as { skuId: number; warehouseId: number; delta: number }
    res.json({ code: 0, data: await inventoryService.adjust(skuId, warehouseId, delta) })
  } catch (err) {
    next(err)
  }
}
