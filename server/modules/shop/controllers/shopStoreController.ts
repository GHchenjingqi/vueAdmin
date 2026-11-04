import type { Request, Response, NextFunction } from 'express'
import * as shopStoreService from '../services/shopStoreService.js'
import { queryInt } from '../utils/query.js'

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const channelId = req.query.channelId ? queryInt(req.query.channelId) : undefined
    const page = req.query.page ? queryInt(req.query.page) : undefined
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) : undefined
    res.json({ code: 0, data: await shopStoreService.listShops({ channelId, page, pageSize }) })
  } catch (err) {
    next(err)
  }
}

export const options = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const channelId = req.query.channelId ? queryInt(req.query.channelId) : undefined
    res.json({ code: 0, data: await shopStoreService.options({ channelId }) })
  } catch (err) {
    next(err)
  }
}

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await shopStoreService.getShopById(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await shopStoreService.createShop(req.body) })
  } catch (err) {
    next(err)
  }
}

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await shopStoreService.updateShop(Number(req.params.id), req.body) })
  } catch (err) {
    next(err)
  }
}

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await shopStoreService.deleteShop(Number(req.params.id))
    res.json({ code: 0, data: null })
  } catch (err) {
    next(err)
  }
}
