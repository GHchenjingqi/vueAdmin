/**
 * 按钮级权限解析服务
 *
 * 与登录接口返回的 permissions 同源（F 类型菜单），使前端 v-permission / Permission
 * 组件与后端 requirePermission 守卫判定一致——不会出现"按钮可见但接口 403"。
 *
 * 缓存：createCache 两级缓存，TTL 60s 兜底；角色/菜单/用户角色变更处显式失效，
 * 保证管理员回收权限后立即生效。
 */
import { Op } from 'sequelize'
import Menu from '../models/Menu.js'
import Role from '../models/Role.js'
import RoleMenu from '../models/RoleMenu.js'
import UserRole from '../models/UserRole.js'
import { createCache } from '../utils/cache.js'

export interface UserGrants {
  /** 角色编码列表（status=1 的角色） */
  roleCodes: string[]
  /** 角色关联的 F 类型菜单权限码 */
  permissions: string[]
}

/** 拥有这些角色编码的用户视为管理员，与前端 directives/permission.ts 保持一致 */
export const ADMIN_ROLE_CODES = ['admin', 'super_admin']

const EMPTY_GRANTS: UserGrants = { roleCodes: [], permissions: [] }

const grantCache = createCache<UserGrants>({ namespace: 'perms', maxAgeMs: 60_000, max: 2000 })

function cacheKey(userId: number): string {
  return `u:${userId}`
}

/** 解析用户的有效授权（角色码 + 按钮权限码） */
export async function getUserGrants(userId: number): Promise<UserGrants> {
  return grantCache.getOrSet(cacheKey(userId), async () => {
    const userRoles = await UserRole.findAll({ where: { userId }, attributes: ['roleId'] })
    const roleIds = [...new Set(userRoles.map((ur) => ur.roleId))]
    if (roleIds.length === 0) return EMPTY_GRANTS

    const roles = await Role.findAll({ where: { id: { [Op.in]: roleIds } }, attributes: ['id', 'code', 'status'] })
    const activeRoles = roles.filter((r) => r.status !== 0)
    if (activeRoles.length === 0) return EMPTY_GRANTS

    const menuGrants = await RoleMenu.findAll({
      where: { roleId: { [Op.in]: activeRoles.map((r) => r.id) } },
      attributes: ['menuId'],
    })
    const menuIds = [...new Set(menuGrants.map((rm) => rm.menuId))]
    if (menuIds.length === 0) return { roleCodes: activeRoles.map((r) => r.code), permissions: [] }

    const buttons = await Menu.findAll({
      where: { id: { [Op.in]: menuIds }, type: 'F', status: 1, permission: { [Op.ne]: null } },
      attributes: ['permission'],
    })

    return {
      roleCodes: activeRoles.map((r) => r.code),
      permissions: [...new Set(buttons.map((b) => b.permission).filter((p): p is string => !!p))],
    }
  })
}

/** 是否为管理员（JWT 平台超管标记 或 命中管理角色码） */
export function isAdminGrants(grants: UserGrants, isPlatformAdmin?: boolean): boolean {
  if (isPlatformAdmin === true) return true
  return grants.roleCodes.some((code) => ADMIN_ROLE_CODES.includes(code))
}

/** 用户角色变更后失效该用户授权 */
export function invalidateUserGrants(userId: number): void {
  grantCache.del(cacheKey(userId))
}

/** 角色/菜单结构变更后失效全部授权 */
export async function invalidateAllGrants(): Promise<void> {
  await grantCache.clear()
}
