import type { Request, Response, NextFunction } from 'express'
import * as categoryService from '../services/categoryService.js'

export const tree = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await categoryService.getCategoryTree()
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const options = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await categoryService.getCategoryOptions()
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await categoryService.getCategoryById(Number(req.params.id))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await categoryService.createCategory(req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await categoryService.updateCategory(Number(req.params.id), req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await categoryService.deleteCategory(Number(req.params.id))
    res.json({ code: 0, data: null })
  } catch (err) {
    next(err)
  }
}
