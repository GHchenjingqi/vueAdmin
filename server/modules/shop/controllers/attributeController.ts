import type { Request, Response, NextFunction } from 'express'
import * as attributeService from '../services/attributeService.js'

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await attributeService.listAttributes(req.query as never)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const options = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined
    const data = await attributeService.getAttributeOptions(categoryId)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await attributeService.getAttributeById(Number(req.params.id))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await attributeService.createAttribute(req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await attributeService.updateAttribute(Number(req.params.id), req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await attributeService.deleteAttribute(Number(req.params.id))
    res.json({ code: 0, data: null })
  } catch (err) {
    next(err)
  }
}
