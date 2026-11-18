import { Request, Response, NextFunction } from 'express'
import sequelize from '../../../config/database.js'

/** 提示词后台接口的管理员校验：平台超管或 roleId=1 的角色 */
export const adminGuard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user as any
    if (!user?.id) {
      res.status(401).json({ code: 401, message: '未登录' })
      return
    }
    if (user.isPlatformAdmin === true) {
      next()
      return
    }
    const [rows] = await sequelize.query('SELECT 1 FROM user_roles WHERE userId = ? AND roleId = 1 LIMIT 1', {
      replacements: [user.id],
    })
    if ((rows as any[]).length === 0) {
      res.status(403).json({ code: 403, message: '需要管理员权限' })
      return
    }
    next()
  } catch (err) {
    next(err)
  }
}
