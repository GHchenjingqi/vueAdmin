/**
 * Express 类型扩展
 * 为 Express Request 添加 user 属性
 */

declare namespace Express {
  interface User {
    id: number
    username: string
    nickname?: string
    roleIds?: number[]
    iat?: number
    exp?: number
  }

  interface Request {
    user?: User
  }
}