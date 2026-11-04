import type { Request, Response, NextFunction } from 'express'
import * as warehouseService from '../services/warehouseService.js'
import { queryInt, queryStr } from '../utils/query.js'

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = queryStr(req.query.type)
    const page = req.query.page ? queryInt(req.query.page) : undefined
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) : undefined
    res.json({ code: 0, data: await warehouseService.listWarehouses({ type, page, pageSize }) })
  } catch (err) {
    next(err)
  }
}

export const options = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await warehouseService.options() })
  } catch (err) {
    next(err)
  }
}

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await warehouseService.getWarehouseById(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await warehouseService.createWarehouse(req.body) })
  } catch (err) {
    next(err)
  }
}

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await warehouseService.updateWarehouse(Number(req.params.id), req.body) })
  } catch (err) {
    next(err)
  }
}

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await warehouseService.deleteWarehouse(Number(req.params.id))
    res.json({ code: 0, data: null })
  } catch (err) {
    next(err)
  }
}
