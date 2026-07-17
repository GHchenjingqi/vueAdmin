/**
 * 用户管理 Controller（参考示例）
 *
 * 职责：仅做 HTTP 请求/响应编排，业务逻辑委托给 userService
 * 此文件是 server/controllers/userController.ts 的精简版，用于 AI 参考项目代码风格
 */
import type { Request, Response, NextFunction } from 'express'
import * as userService from '../services/userService.js'
import { AppError } from '../middleware/errorHandler.js'
import { logOperation } from '../utils/logger.js'

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, pageSize = 10 } = req.query
    const result = await userService.listUsers(
      req.query as any,
      Number(page),
      Number(pageSize),
    )
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userService.getUserById(Number(req.params.id))
    res.json({ code: 0, data: user })
  } catch (err) {
    next(err)
  }
}

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await userService.createUser(req.body, req.user!)
    logOperation(req, '创建用户', `ID: ${result.id} 用户名 ${req.body.username}`,
      JSON.stringify({ id: result.id, ...req.body }))
    res.status(201).json({ code: 0, data: result, message: '创建成功' })
  } catch (err) {
    next(err)
  }
}

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await userService.updateUser(Number(req.params.id), req.body, req.user!)
    logOperation(req, '更新用户', `ID: ${req.params.id}`,
      JSON.stringify(req.body))
    res.json({ code: 0, message: '更新成功' })
  } catch (err) {
    next(err)
  }
}

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, username } = await userService.deleteUser(Number(req.params.id))
    logOperation(req, '删除用户', `ID: ${id} 用户名 ${username}`, JSON.stringify({ id, username }))
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}