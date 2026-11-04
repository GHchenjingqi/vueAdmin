import type { Request, Response, NextFunction } from 'express'
import * as orderService from '../services/orderService.js'
import { queryInt, queryStr } from '../utils/query.js'

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const channelId = req.query.channelId ? queryInt(req.query.channelId) : undefined
    const status = queryStr(req.query.status)
    const page = req.query.page ? queryInt(req.query.page) : undefined
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) : undefined
    res.json({ code: 0, data: await orderService.listOrders({ channelId, status, page, pageSize }) })
  } catch (err) {
    next(err)
  }
}

export const detail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await orderService.getOrderById(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(201).json({ code: 0, data: await orderService.createManualOrder(req.body) })
  } catch (err) {
    next(err)
  }
}

export const markPaid = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await orderService.markPaid(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}

export const ship = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await orderService.ship(Number(req.params.id), req.body) })
  } catch (err) {
    next(err)
  }
}

export const cancel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await orderService.cancel(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}
