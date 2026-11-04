import type { Request, Response, NextFunction } from 'express'
import * as spuService from '../services/spuService.js'

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await spuService.listSpus(req.query as never)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const detail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await spuService.getSpuDetail(Number(req.params.id))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await spuService.createSpu(req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await spuService.updateSpu(Number(req.params.id), req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** 状态机流转（submit/reject/list/publish/unlist/archive） */
export const changeStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, reason } = req.body as { action: string; reason?: string }
    const data = await spuService.changeSpuStatus(Number(req.params.id), action as never, reason)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await spuService.deleteSpu(Number(req.params.id))
    res.json({ code: 0, data: null })
  } catch (err) {
    next(err)
  }
}
