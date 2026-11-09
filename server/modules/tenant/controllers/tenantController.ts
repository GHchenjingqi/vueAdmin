import type { NextFunction, Request, Response } from 'express'
import * as tenantService from '../services/tenantService.js'
import type { TenantQueryInput, ProvisionTenantInput, UpdateTenantInput } from '../../../shared/schemas/tenant.js'

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await tenantService.listTenants(req.query as unknown as TenantQueryInput)
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const tenant = await tenantService.getTenantById(Number(req.params.id))
    res.json({ code: 0, data: tenant })
  } catch (err) {
    next(err)
  }
}

export async function provision(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as ProvisionTenantInput
    const result = await tenantService.provisionTenant({
      name: body.name,
      code: body.code,
      planId: body.planId,
      deptName: body.deptName,
      brand: body.brand,
      admin: body.admin,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    })
    res.json({ code: 0, data: result, message: '租户开通成功' })
  } catch (err) {
    next(err)
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as UpdateTenantInput
    const tenant = await tenantService.updateTenant(Number(req.params.id), {
      name: body.name,
      brand: body.brand,
      planId: body.planId,
      expiresAt: body.expiresAt === undefined ? undefined : body.expiresAt ? new Date(body.expiresAt) : null,
    })
    res.json({ code: 0, data: tenant, message: '保存成功' })
  } catch (err) {
    next(err)
  }
}

export async function setStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await tenantService.setTenantStatus(Number(req.params.id), Number(req.body.status))
    res.json({ code: 0, data: result, message: '状态已更新' })
  } catch (err) {
    next(err)
  }
}

/** 租户自助读取本租户品牌/套餐；任何登录用户都可访问，且只能读到自己的租户 */
export async function current(req: Request, res: Response, next: NextFunction) {
  try {
    const info = await tenantService.getCurrentTenantInfo(Number(req.user?.tenantId ?? 0))
    res.json({ code: 0, data: info })
  } catch (err) {
    next(err)
  }
}
