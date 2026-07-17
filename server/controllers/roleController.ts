/**
 * 角色管理 Controller
 *
 * 职责：仅做 HTTP 请求/响应编排，业务逻辑委托给 roleService
 */
import type { Request, Response, NextFunction } from 'express'
import * as roleService from '../services/roleService.js'
import { logOperation } from '../utils/logger.js'

/**
 * 获取角色列表
 * - ?scope=all 获取所有启用角色（下拉选择器用）
 * GET /api/roles
 */
export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // ?scope=all - 获取所有启用角色（下拉用）
    if (req.query.scope === 'all') {
      const roles = await roleService.getAllActiveRoles()
      return res.json({ code: 0, data: roles })
    }

    const result = await roleService.listRoles(req.query as any)
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取单个角色
 * GET /api/roles/:id
 */
export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const role = await roleService.getRoleById(Number(req.params.id))
    res.json({ code: 0, data: role })
  } catch (err) {
    next(err)
  }
}

/**
 * 创建角色
 * POST /api/roles
 */
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await roleService.createRole(req.body)
    logOperation(req, '创建角色', `ID: ${result.id} 名称: ${result.name}`)
    res.status(201).json({ code: 0, data: { id: result.id }, message: '创建成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 更新角色
 * PUT /api/roles/:id
 */
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { changes, summary, name } = await roleService.updateRole(Number(req.params.id), req.body)
    logOperation(req, '更新角色', `ID: ${req.params.id} 名称: ${name}`,
      JSON.stringify({ changes, summary }))
    res.json({ code: 0, message: '更新成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 删除角色
 * DELETE /api/roles/:id
 */
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, name } = await roleService.deleteRole(Number(req.params.id))
    logOperation(req, '删除角色', `ID: ${id} 名称: ${name}`)
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}

/** 获取所有启用角色（用于下拉选择器），委托给 list 的 scope=all 逻辑 */
export const all = async (req: Request, res: Response, next: NextFunction) => {
  req.query.scope = 'all'
  return list(req, res, next)
}