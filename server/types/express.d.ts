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
    /** 所属租户 ID（多租户） */
    tenantId?: number
    /** 有效数据范围：1=全部 2=本部门 3=本级及以下 */
    dataScope?: number
    /** dataScope=3 时由认证中间件解析出的可见部门集合（含自身与全部下级） */
    deptIds?: number[]
    /** 平台超管（跨租户可见，登录时按 username=admin 或 platform_admin 角色判定） */
    isPlatformAdmin?: boolean
    iat?: number
    exp?: number
  }

  interface Request {
    user?: User
  }
}
