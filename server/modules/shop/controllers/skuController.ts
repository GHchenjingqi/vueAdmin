import type { Request, Response, NextFunction } from 'express'
import * as skuService from '../services/skuService.js'
import { queryInt, queryStr } from '../utils/query.js'

/** 全局 SKU 列表（跨 SPU），供库存中心选择 SKU */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keyword = queryStr(req.query.keyword)
    const page = req.query.page ? queryInt(req.query.page) : undefined
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) : undefined
    const data = await skuService.listSkus({ keyword, page, pageSize })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

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
