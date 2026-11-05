import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import type { CreateAddressInput, UpdateAddressInput } from '../../../shared/schemas/customer.js'
import type { AddressOwner } from '../services/addressService.js'
import * as addressService from '../services/addressService.js'
import { getSite } from '../middleware/siteContext.js'

/**
 * P4-T02 地址簿 HTTP 层：归属一律取顾客 JWT，并校验 JWT 租户与站点租户一致，
 * 防止 A 站点的令牌在 B 站点读取同一 customerId 下的地址。
 */
function ownerOf(req: Request, res: Response): AddressOwner {
  const c = req.customer
  if (!c) throw new AppError(401, '请先登录')
  const site = getSite(res)
  if (c.tenantId !== site.tenantId) throw new AppError(401, 'ADDRESS_SITE_MISMATCH: 顾客令牌与站点不匹配')
  return { tenantId: c.tenantId, customerId: c.customerId }
}

/** GET /addresses */
export const listAddresses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ code: 0, data: await addressService.listAddresses(ownerOf(req, res)) })
  } catch (err) {
    next(err)
  }
}

/** POST /addresses */
export const createAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await addressService.createAddress(ownerOf(req, res), req.body as CreateAddressInput)
    res.status(201).json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** PATCH /addresses/:id */
export const updateAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number((req.params as Record<string, unknown>).id)
    const data = await addressService.updateAddress(ownerOf(req, res), id, req.body as UpdateAddressInput)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** DELETE /addresses/:id */
export const deleteAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number((req.params as Record<string, unknown>).id)
    res.json({ code: 0, data: await addressService.deleteAddress(ownerOf(req, res), id) })
  } catch (err) {
    next(err)
  }
}

/** POST /addresses/:id/default */
export const setDefaultAddress = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number((req.params as Record<string, unknown>).id)
    res.json({ code: 0, data: await addressService.setDefaultAddress(ownerOf(req, res), id) })
  } catch (err) {
    next(err)
  }
}
