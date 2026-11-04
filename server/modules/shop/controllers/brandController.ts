import type { Request, Response, NextFunction } from 'express'
import * as brandService from '../services/brandService.js'

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await brandService.listBrands(req.query as never)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const options = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await brandService.getBrandOptions()
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await brandService.getBrandById(Number(req.params.id))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await brandService.createBrand(req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await brandService.updateBrand(Number(req.params.id), req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await brandService.deleteBrand(Number(req.params.id))
    res.json({ code: 0, data: null })
  } catch (err) {
    next(err)
  }
}
