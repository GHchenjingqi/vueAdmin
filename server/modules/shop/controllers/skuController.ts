import type { Request, Response, NextFunction } from 'express'
import * as skuService from '../services/skuService.js'

/** SPU 下的 SKU 列表（路径参数 spuId） */
export const listBySpu = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await skuService.listSkusBySpu(Number(req.params.spuId))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await skuService.getSkuById(Number(req.params.id))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await skuService.createSku(req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await skuService.updateSku(Number(req.params.id), req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await skuService.deleteSku(Number(req.params.id))
    res.json({ code: 0, data: null })
  } catch (err) {
    next(err)
  }
}
