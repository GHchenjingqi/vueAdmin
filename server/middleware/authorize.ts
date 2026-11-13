/**
 * 后端授权守卫（管理端写操作）
 * @module authorize
 *
 * 背景（安全整改）：
 *   管理端此前只有「认证」（authMiddleware 校验登录态），没有「授权」——
 *   按钮级权限完全依赖前端 v-permission 指令隐藏元素，而前端隐藏不等于后端拒绝。
 *   实测（低权用户 dataScope=2 / 非管理员）可越权执行：
 *   改全局设置、建/改/删角色、改菜单、建部门、清审计日志、写通知渠道凭据、
 *   重置他人密码（含 admin）、给自己授予 platform_admin 角色完成提权。
 *
 * 设计：
 *   - 判定依据为**角色码**（Role.code）：当前 menus 表无 type='F' 的按钮权限数据，
 *     权限码体系尚未落地，角色码是当前唯一可判定的口径，且与前端 v-permission
 *     的 `roles.includes('admin')` 语义保持一致。
 *   - 分两级：requireManage（租户级管理权）/ requirePlatformAdmin（跨租户平台权）。
 *   - 只做「是否具备管理资格」的粗粒度拦截；具体对象的归属与数据范围
 *     （如不能操作比自己权限高的账号）由 service 层的归属校验负责。
 */

import type { NextFunction, Request, Response } from 'express'
import { AppError } from './errorHandler.js'
import { resolveOperatorAuthority, type OperatorLike } from '../utils/operator.js'

/**
 * 管理写操作守卫：要求操作者具备租户级管理权（admin / super_admin / platform_admin）。
 *
 * 用法：router.post('/users', authMiddleware, requireManage, userController.create)
 */
export async function requireManage(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as unknown as { user?: OperatorLike }).user
    if (!user) {
      next(new AppError(401, 'AUTH_REQUIRED'))
      return
    }
    const authority = await resolveOperatorAuthority(user)
    if (!authority.isManager) {
      next(new AppError(403, 'FORBIDDEN: 无管理权限'))
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * 平台管理守卫：要求操作者为平台超管（platform_admin 角色，跨租户）。
 *
 * 用于「管理权本身」的操作——角色定义、平台超管判定等。
 * 租户级管理员不得修改角色体系，避免其自行提权为平台超管。
 */
export async function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as unknown as { user?: OperatorLike }).user
    if (!user) {
      next(new AppError(401, 'AUTH_REQUIRED'))
      return
    }
    const authority = await resolveOperatorAuthority(user)
    if (!authority.isPlatformAdmin) {
      next(new AppError(403, 'ADMIN_REQUIRED: 需要平台管理员权限'))
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}
