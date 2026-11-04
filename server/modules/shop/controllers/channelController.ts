import type { Request, Response, NextFunction } from 'express'
import * as channelService from '../services/channelService.js'
import { queryInt } from '../utils/query.js'

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = req.query.page ? queryInt(req.query.page) : undefined
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) : undefined
    const data = await channelService.listChannels({ page, pageSize })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const options = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await channelService.options() })
  } catch (err) {
    next(err)
  }
}

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await channelService.getChannelById(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await channelService.createChannel(req.body) })
  } catch (err) {
    next(err)
  }
}

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await channelService.updateChannel(Number(req.params.id), req.body) })
  } catch (err) {
    next(err)
  }
}

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await channelService.deleteChannel(Number(req.params.id))
    res.json({ code: 0, data: null })
  } catch (err) {
    next(err)
  }
}
