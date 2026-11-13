/**
 * 操作者权限判定（统一口径）
 * @module operator
 *
 * 背景（安全整改）：
 *   此前平台超管判定为 `username === 'admin' || 持有 platform_admin 角色`。
 *   但 users 表的用户名唯一性是 (tenantId, username) 复合唯一——任意租户都能
 *   创建一个名为 'admin' 的账号，该账号登录后即被判定为平台超管，
 *   绕过全部租户隔离（tenantContext 的 bypass 置 true，Sequelize 全局租户
 *   钩子随之失效）。实测该路径可跨租户读写数据。
 *
 * 权限分级（与种子数据、前端 v-permission 语义对齐）：
 *   - platform_admin 角色 → 平台超管：跨租户管理权（对应 tenantContext bypass），
 *     且是唯一可授予 platform_admin 角色、唯一可改写 platform_admin 角色定义者。
 *   - admin 角色（dataScope=1，拥有所有权限）→ 全局管理员：
 *     可执行全部管理端写操作（含菜单/设置/日志），可授予 admin 级角色，
 *     但不具备跨租户能力。
 *   - 其它角色 → 普通用户
 *
 * 前端 permission.ts 的判定为 `roles.includes('admin') || roles.includes('super_admin')`
 * 即视为全权；此处后端口径与之对齐：admin / super_admin / platform_admin
 * 均可执行管理端写操作。
 */

import { Op } from 'sequelize'
import Role from '../models/Role.js'
import UserRole from '../models/UserRole.js'

/** 拥有全局管理权的角色码（可执行全部管理端写操作） */
export const MANAGER_ROLE_CODES = ['admin', 'super_admin'] as const

/** 拥有平台（跨租户）管理权的角色码 */
export const PLATFORM_ADMIN_ROLE_CODE = 'platform_admin'

/** 管理权角色码（授予这些角色等价于授予管理权） */
export const ADMIN_ROLE_CODES = ['admin', 'super_admin', 'platform_admin'] as const

/** 用户上下文（JWT 解出的 req.user 或测试桩） */
export interface OperatorLike {
  id?: number
  username?: string
  tenantId?: number
  isPlatformAdmin?: boolean
  roles?: string[]
}

export interface OperatorAuthority {
  /** 持有 platform_admin 角色（跨租户） */
  isPlatformAdmin: boolean
  /** 具备全局管理权（admin / super_admin / platform_admin 任一） */
  isManager: boolean
  /** 生效的角色码集合 */
  roleCodes: string[]
}

/**
 * 解析操作者的权限身份。
 *
 * 优先使用 JWT 内携带的 roles（登录时写入，避免每请求额外查库）；
 * 存量 token 无 roles 字段时回退查库，保证旧会话同样受控。
 */
export async function resolveOperatorAuthority(op?: OperatorLike): Promise<OperatorAuthority> {
  const roleCodes = new Set<string>(op?.roles ?? [])
  if (roleCodes.size === 0 && op?.id != null) {
    // 回退查库：存量 token 无 roles 字段时，保证旧会话同样受控。
    // 查库失败（如模型不可用）时不放大权限——按最保守口径降级。
    try {
      const userRoles = await UserRole.findAll({ where: { userId: op.id }, attributes: ['roleId'] })
      if (userRoles.length > 0) {
        const roleIds = [...new Set(userRoles.map((ur) => ur.roleId))]
        const roles = await Role.findAll({ where: { id: { [Op.in]: roleIds } }, attributes: ['code'] })
        for (const r of roles) {
          const code = (r as unknown as { code?: string }).code
          if (code) roleCodes.add(code)
        }
      }
    } catch {
      // 忽略：以下按已解析到的 roleCodes 判定
    }
  }

  // 平台超管以角色为准：username 不再作为判据（跨租户同名即可提权，见文件头说明）
  const isPlatformAdmin = roleCodes.has(PLATFORM_ADMIN_ROLE_CODE) || op?.isPlatformAdmin === true
  const isManager =
    isPlatformAdmin ||
    MANAGER_ROLE_CODES.some((code) => roleCodes.has(code)) ||
    roleCodes.has(PLATFORM_ADMIN_ROLE_CODE)

  return { isPlatformAdmin, isManager, roleCodes: [...roleCodes] }
}
