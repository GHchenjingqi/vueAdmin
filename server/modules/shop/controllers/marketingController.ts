import type { Request, Response, NextFunction } from 'express'
import * as marketingService from '../services/marketingService.js'
import { queryInt, queryStr } from '../utils/query.js'

// ==================== 营销活动 ====================

export const listPromotions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const type = queryStr(req.query.type)
    const page = req.query.page ? queryInt(req.query.page) : undefined
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) : undefined
    res.json({ code: 0, data: await marketingService.listPromotions({ type, page, pageSize }) })
  } catch (err) {
    next(err)
  }
}

export const getPromotion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await marketingService.getPromotionById(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}

export const createPromotion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await marketingService.createPromotion(req.body) })
  } catch (err) {
    next(err)
  }
}

export const updatePromotion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await marketingService.updatePromotion(Number(req.params.id), req.body) })
  } catch (err) {
    next(err)
  }
}

export const deletePromotion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await marketingService.deletePromotion(Number(req.params.id))
    res.json({ code: 0, data: null })
  } catch (err) {
    next(err)
  }
}

// ==================== 优惠券 ====================

export const listCoupons = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = req.query.page ? queryInt(req.query.page) : undefined
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) : undefined
    res.json({ code: 0, data: await marketingService.listCoupons({ page, pageSize }) })
  } catch (err) {
    next(err)
  }
}

export const getCoupon = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await marketingService.getCouponById(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}

export const createCoupon = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await marketingService.createCoupon(req.body) })
  } catch (err) {
    next(err)
  }
}

export const updateCoupon = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await marketingService.updateCoupon(Number(req.params.id), req.body) })
  } catch (err) {
    next(err)
  }
}

export const deleteCoupon = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await marketingService.deleteCoupon(Number(req.params.id))
    res.json({ code: 0, data: null })
  } catch (err) {
    next(err)
  }
}

// ==================== Bundle / 搭配购 ====================

export const listBundles = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = req.query.page ? queryInt(req.query.page) : undefined
    const pageSize = req.query.pageSize ? queryInt(req.query.pageSize) : undefined
    const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined
    res.json({ code: 0, data: await marketingService.listBundles({ page, pageSize, active }) })
  } catch (err) {
    next(err)
  }
}

export const getBundle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await marketingService.getBundleById(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}

export const createBundle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await marketingService.createBundle(req.body) })
  } catch (err) {
    next(err)
  }
}

export const updateBundle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await marketingService.updateBundle(Number(req.params.id), req.body) })
  } catch (err) {
    next(err)
  }
}

export const deleteBundle = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await marketingService.deleteBundle(Number(req.params.id))
    res.json({ code: 0, data: null })
  } catch (err) {
    next(err)
  }
}
