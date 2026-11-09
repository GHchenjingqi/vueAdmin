/**
 * 菜单/角色模板复制（T11 租户开通闭环）
 *
 * 约定：
 * - tenantId=0 的菜单是「平台菜单模板」，不服务于任何真实租户；
 * - copyable=0 的模板行是「平台专属」（如租户管理），永不随开通下发；
 * - 每个租户拥有自己的菜单副本，角色授权指向本租户副本，因此租户可以自己
 *   调整菜单名称/排序/启停而不影响其他租户。
 *
 * 迁移、种子与运行时开通共用这里的实现，避免三份复制算法各自漂移。
 */
import { Op, type Transaction } from 'sequelize'
import Menu from '../../../models/Menu.js'
import Role from '../../../models/Role.js'
import RoleMenu from '../../../models/RoleMenu.js'
import Tenant from '../models/Tenant.js'
import { DEFAULT_TENANT_ID, PLATFORM_TENANT_ID, ROLE_TEMPLATE_CODES } from '../constants.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { PERMISSION_CATALOG } from '../../../utils/permissionCatalog.js'

type ScopedOptions = { transaction?: Transaction }

/** 菜单在「模板 ↔ 副本」之间的身份键：页面用 path，按钮用 permission */
export function menuIdentityKey(menu: { type: string; path: string; permission?: string | null; name: string }): string {
  return `${menu.type}:${menu.path || menu.permission || menu.name}`
}

const COPY_FIELDS = ['parentId', 'name', 'path', 'component', 'icon', 'sort', 'type', 'permission', 'status', 'hidden'] as const

/**
 * 把平台菜单模板复制给指定租户，返回 模板id -> 副本id。
 * 已存在副本的租户直接返回空映射（幂等）。
 */
export async function copyTemplateMenus(tenantId: number, options: ScopedOptions = {}): Promise<Map<number, number>> {
  const map = new Map<number, number>()
  const existing = await Menu.count({ where: { tenantId }, transaction: options.transaction })
  if (existing > 0) return map

  const templates = await Menu.findAll({
    where: { tenantId: PLATFORM_TENANT_ID, copyable: 1 },
    order: [
      ['parentId', 'ASC'],
      ['id', 'ASC'],
    ],
    transaction: options.transaction,
  })

  // 父级必须先于子级落库，才能换算 parentId；脏数据成环时显式失败而不是静默丢菜单
  const pending = [...templates]
  let progressed = true
  while (pending.length && progressed) {
    progressed = false
    for (let i = pending.length - 1; i >= 0; i--) {
      const template = pending[i]
      if (template.parentId !== 0 && !map.has(template.parentId)) continue
      const payload: Record<string, unknown> = { tenantId }
      for (const field of COPY_FIELDS) {
        payload[field] = field === 'parentId' ? (template.parentId === 0 ? 0 : map.get(template.parentId)) : template[field]
      }
      const copy = await Menu.create(payload as any, { transaction: options.transaction })
      map.set(template.id, copy.id)
      pending.splice(i, 1)
      progressed = true
    }
  }
  if (pending.length > 0) {
    throw new AppError(500, `菜单模板存在父子环，无法为租户 ${tenantId} 复制：menuId=${pending.map((m) => m.id).join(',')}`)
  }
  return map
}

/** 取某租户的菜单（含平台模板之外的自有行）的 key -> id 映射 */
async function tenantMenuKeyMap(tenantId: number, options: ScopedOptions): Promise<Map<string, number>> {
  const menus = await Menu.findAll({ where: { tenantId }, transaction: options.transaction })
  const map = new Map<string, number>()
  for (const menu of menus) map.set(menuIdentityKey(menu), menu.id)
  return map
}

/** 平台控制台页面菜单；permissionCatalog 的 system:tenant:* 三条按钮挂在它下面 */
const PLATFORM_CONSOLE_MENU = {
  parentId: 0,
  name: '租户管理',
  path: '/tenants',
  component: 'views/TenantList.vue',
  icon: 'OfficeBuilding',
  type: 'M' as const,
  sort: 200,
  status: 1,
  hidden: 0,
  permission: null,
}

/**
 * 落库平台控制台菜单（租户管理）及其按钮权限，并只授给默认租户的 platform_admin 角色。
 * copyable=0 保证它永不下发给租户，租户侧无论怎么授权都拿不到平台入口。
 */
export async function ensurePlatformConsoleMenus(options: ScopedOptions = {}): Promise<{ pageId: number }> {
  let page = await Menu.findOne({ where: { path: PLATFORM_CONSOLE_MENU.path }, transaction: options.transaction })
  if (!page) {
    page = await Menu.create({ ...PLATFORM_CONSOLE_MENU, tenantId: PLATFORM_TENANT_ID, copyable: 0 }, { transaction: options.transaction })
  }

  for (const entry of PERMISSION_CATALOG.filter((item) => item.parentPath === PLATFORM_CONSOLE_MENU.path)) {
    const existing = await Menu.findOne({ where: { permission: entry.code }, transaction: options.transaction })
    if (existing) continue
    await Menu.create(
      {
        parentId: page.id,
        name: entry.name,
        path: '',
        component: null,
        icon: null,
        type: 'F',
        permission: entry.code,
        sort: 0,
        status: 1,
        hidden: 0,
        tenantId: PLATFORM_TENANT_ID,
        copyable: 0,
      },
      { transaction: options.transaction },
    )
  }

  const buttons = await Menu.findAll({ where: { parentId: page.id }, attributes: ['id'], transaction: options.transaction })
  const platformRoles = await Role.findAll({ where: { code: 'platform_admin', tenantId: DEFAULT_TENANT_ID }, transaction: options.transaction })
  for (const role of platformRoles) {
    for (const menuId of [page.id, ...buttons.map((b) => b.id)]) {
      const granted = await RoleMenu.findOne({ where: { roleId: role.id, menuId }, transaction: options.transaction })
      if (!granted) await RoleMenu.create({ roleId: role.id, menuId }, { transaction: options.transaction })
    }
  }
  return { pageId: page.id }
}

/**
 * 把租户角色当前指向「平台模板菜单」的授权改写到该租户自己的副本上。
 * 未复制成功的键（平台专属菜单）会失去授权记录——这正是期望行为：
 * 平台专属功能不应出现在任何租户角色的授权树里。
 */
export async function remapRoleMenusToCopies(tenantId: number, options: ScopedOptions = {}): Promise<number> {
  const map = await copyTemplateMenus(tenantId, options)
  const templateMenus = await Menu.findAll({ where: { tenantId: PLATFORM_TENANT_ID }, transaction: options.transaction })
  const templateKeyById = new Map(templateMenus.map((m) => [m.id, menuIdentityKey(m)]))
  const copyKeyMap = await tenantMenuKeyMap(tenantId, options)

  const tenantRoles = await Role.findAll({ where: { tenantId }, attributes: ['id'], transaction: options.transaction })
  if (tenantRoles.length === 0) return 0

  const grants = await RoleMenu.findAll({
    where: { roleId: { [Op.in]: tenantRoles.map((r) => r.id) }, menuId: { [Op.in]: [...templateKeyById.keys()] } },
    transaction: options.transaction,
  })

  let remapped = 0
  for (const grant of grants) {
    const key = templateKeyById.get(grant.menuId)
    const copyId = key ? copyKeyMap.get(key) : undefined
    if (!copyId) {
      await grant.destroy({ transaction: options.transaction })
      continue
    }
    if (copyId === grant.menuId) continue
    await grant.update({ menuId: copyId }, { transaction: options.transaction })
    remapped += 1
  }
  return remapped
}

/**
 * 以来源租户（默认租户 1）的模板角色为蓝本，为目标租户创建同名同码角色并授予
 * 目标租户自己的菜单副本。新租户由此立刻获得「管理员 + 普通用户」两档授权。
 */
export async function cloneRolesForTenant(tenantId: number, options: ScopedOptions = {}): Promise<{ adminRoleId: number | null; roleIds: number[] }> {
  const sourceRoles = await Role.findAll({
    where: { tenantId: DEFAULT_TENANT_ID, code: { [Op.in]: ROLE_TEMPLATE_CODES } },
    order: [['sort', 'ASC']],
    transaction: options.transaction,
  })
  if (sourceRoles.length === 0) {
    throw new AppError(500, `默认租户缺少角色模板（code in ${ROLE_TEMPLATE_CODES.join(',')}），无法为新租户初始化角色`)
  }

  const copyKeyMap = await tenantMenuKeyMap(tenantId, options)
  const roleIds: number[] = []
  let adminRoleId: number | null = null

  for (const source of sourceRoles) {
    const created = await Role.create(
      { name: source.name, code: source.code, sort: source.sort, status: source.status, dataScope: source.dataScope, remark: source.remark, tenantId },
      { transaction: options.transaction },
    )
    roleIds.push(created.id)
    if (source.code === 'admin' && adminRoleId === null) adminRoleId = created.id

    const sourceGrants = await RoleMenu.findAll({ where: { roleId: source.id }, transaction: options.transaction })
    if (sourceGrants.length === 0) continue
    const templateMenus = await Menu.findAll({ where: { id: { [Op.in]: sourceGrants.map((g) => g.menuId) } }, transaction: options.transaction })
    const grants = templateMenus
      .map((menu) => copyKeyMap.get(menuIdentityKey(menu)))
      .filter((menuId): menuId is number => typeof menuId === 'number')
      .map((menuId) => ({ roleId: created.id, menuId }))
    if (grants.length > 0) await RoleMenu.bulkCreate(grants, { ignoreDuplicates: true, transaction: options.transaction })
  }

  return { adminRoleId, roleIds }
}

/**
 * 平台菜单模板 + 各租户菜单副本的就绪检查（迁移与种子共用）。
 *
 * 为什么两处都要调用：新库上迁移先跑，那时菜单表还是空的（模板由种子/启动逻辑写入），
 * 只有到种子阶段模板才存在，副本也就只能在这里补齐——否则非平台用户登录后侧边栏为空。
 */
export async function materializeTenantMenus(options: ScopedOptions = {}): Promise<{ tenants: number }> {
  await ensurePlatformConsoleMenus(options)
  const tenants = await materializeMenusForAllTenants(options)
  return { tenants }
}

/**
 * 给所有尚未持有菜单副本的租户补齐；无副本的租户先复制模板再改写角色授权。
 */
export async function materializeMenusForAllTenants(options: ScopedOptions = {}): Promise<number> {
  const tenants = await Tenant.findAll({ order: [['id', 'ASC']], transaction: options.transaction })
  let done = 0
  for (const tenant of tenants) {
    const owned = await Menu.count({ where: { tenantId: tenant.id }, transaction: options.transaction })
    if (owned > 0) continue
    // remap 内部会先完成复制，再改写既有角色授权
    await remapRoleMenusToCopies(tenant.id, options)
    done += 1
  }
  return done
}
