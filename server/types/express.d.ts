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
    /** 所属部门 ID（数据权限） */
    deptId?: number
    /** 有效数据范围：1=全部 2=本部门 3=本级及以下 */
    dataScope?: number
    iat?: number
    exp?: number
  }

  interface Request {
    user?: User
  }
}