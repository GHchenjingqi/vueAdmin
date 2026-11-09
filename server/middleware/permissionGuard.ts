/**
 * 按钮级权限守卫
 *
 * 用法：router.post('/users', authMiddleware, requirePermission('system:user:add'), handler)
 *
 * 判定顺序（与前端 directives/permission.ts 一致）：
 * 1. JWT 平台超管标记（isPlatformAdmin）直接放行；
 * 2. 命中管理角色码（admin / super_admin）放行；
 * 3. 声明的权限码任一被授予则放行（any-of 语义）；
 * 4. 其余一律 403。
 *
 * 失败关闭：解析授权时抛错交给 errorHandler（500），不因查询失败而放行请求。
 */
import type { Request, Response, NextFunction } from 'express'
import { getUserGrants, isAdminGrants } from '../services/permissionService.js'

export function requirePermission(first: string, ...rest: string[]) {
  const codes = [first, ...rest]
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user
    if (!user?.id) {
      res.status(401).json({ code: 401, message: '未提供认证令牌' })
      return
    }

    // 平台超管在 JWT 签发时已标记，无需回查授权表
    if (user.isPlatformAdmin === true) {
      next()
      return
    }

    try {
      const grants = await getUserGrants(user.id)
      if (isAdminGrants(grants, false)) {
        next()
        return
      }
      if (codes.some((code) => grants.permissions.includes(code))) {
        next()
        return
      }
      res.status(403).json({ code: 403, message: `缺少操作权限：${codes.join(' 或 ')}` })
    } catch (err) {
      next(err)
    }
  }
}
