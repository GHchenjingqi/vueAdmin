import type { Request, Response, NextFunction } from 'express'
import * as channelProductService from '../services/channelProductService.js'
import { queryInt } from '../utils/query.js'

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const channelId = req.query.channelId ? queryInt(req.query.channelId) : undefined
    const shopId = req.query.shopId ? queryInt(req.query.shopId) : undefined
    const spuId = req.query.spuId ? queryInt(req.query.spuId) : undefined
    const page = req.query.page ? queryInt(req.query.page) : undefined
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) : undefined
    res.json({ code: 0, data: await channelProductService.listChannelProducts({ channelId, shopId, spuId, page, pageSize }) })
  } catch (err) {
    next(err)
  }
}

export const publish = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { spuId, channelId, shopId, skuId, requiredQualifications } = req.body as {
      spuId: number
      channelId: number
      shopId: number
      skuId?: number
      requiredQualifications?: string[]
    }
    res.json({ code: 0, data: await channelProductService.publishToChannel(spuId, channelId, shopId, { skuId, requiredQualifications }) })
  } catch (err) {
    next(err)
  }
}
