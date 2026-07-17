/**
 * 部门管理控制器
 * @module deptController
 */

import { Request, Response, NextFunction } from 'express'
import { listDepts, getDeptById, createDept, updateDept, deleteDept, getDeptOptions } from '../services/deptService.js'
import { logOperation } from '../utils/logger.js'

/**
 * 获取部门列表
 * - ?scope=options 获取选项树
 */
export const list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const scope = req.query.scope as string | undefined
    const data = await listDepts(scope)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取单个部门
 */
export const getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dept = await getDeptById(Number(req.params.id))
    res.json({ code: 0, data: dept })
  } catch (err) {
    next(err)
  }
}

/**
 * 创建部门
 */
export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await createDept(req.body)
    logOperation(req, '创建部门', `ID: ${result.id} 名称: ${result.name}`)
    res.status(201).json({ code: 0, data: { id: result.id }, message: '创建成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 更新部门
 */
export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const result = await updateDept(id, req.body)
    logOperation(req, '更新部门', `ID: ${id} 名称: ${result.name}`,
      JSON.stringify({ changes: result.changes, summary: result.summary }))
    res.json({ code: 0, message: '更新成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 删除部门
 */
export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = Number(req.params.id)
    const result = await deleteDept(id)
    logOperation(req, '删除部门', `ID: ${id} 名称: ${result.name}`)
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取部门下拉选项
 */
export const options = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await getDeptOptions()
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}