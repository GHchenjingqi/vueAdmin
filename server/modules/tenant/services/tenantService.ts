/**
 * 租户管理 Service（T11 平台超管侧）
 *
 * 只有平台超管可写（路由挂 platformOnly + requirePermission）；
 * 租户自己的用户只能通过 GET /tenants/current 读取本租户的品牌信息。
 */
import { Op, type Transaction } from 'sequelize'
import sequelize from '../../../config/database.js'
import Tenant from '../models/Tenant.js'
import Menu from '../../../models/Menu.js'
import Department from '../../../models/Department.js'
import User from '../../../models/User.js'
import UserRole from '../../../models/UserRole.js'
import Plan from '../../../modules/billing/models/Plan.js'
import Subscription from '../../../modules/billing/models/Subscription.js'
import { issueInvoice } from '../../../modules/billing/services/invoiceService.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { validatePasswordStrength } from '../../../services/authService.js'
import { cloneRolesForTenant, copyTemplateMenus } from './menuTemplateService.js'
import { DEFAULT_TENANT_ID } from '../constants.js'

export interface TenantBrand {
  title?: string
  logo?: string
  color?: string
}

export interface ProvisionInput {
  name?: string
  code?: string
  planId?: number
  brand?: TenantBrand
  deptName?: string
  expiresAt?: Date | null
  admin?: { username?: string; nickname?: string; email?: string; phone?: string; password?: string }
}

const CODE_RE = /^[a-z][a-z0-9-]{1,29}$/

function normalizeBrand(brand?: TenantBrand): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  if (brand?.title?.trim()) cleaned.title = brand.title.trim()
  if (brand?.logo?.trim()) cleaned.logo = brand.logo.trim()
  if (brand?.color?.trim()) cleaned.color = brand.color.trim()
  return cleaned
}

/** 租户状态合法值：1=启用 0=禁用 2=冻结（禁用/冻结均拦截登录，冻结保留数据可恢复） */
const TENANT_STATUSES = [0, 1, 2]

export async function listTenants(query: { page?: number; pageSize?: number; name?: string; code?: string; status?: number | string }) {
  const page = Number(query.page || 1)
  const pageSize = Number(query.pageSize || 10)
  const where: Record<string, unknown> = {}
  if (query.name) where.name = { [Op.like]: `%${query.name}%` }
  if (query.code) where.code = { [Op.like]: `%${query.code}%` }
  if (query.status !== undefined && query.status !== '') where.status = Number(query.status)

  const { rows, count } = await Tenant.findAndCountAll({
    where,
    offset: (page - 1) * pageSize,
    limit: pageSize,
    order: [['id', 'ASC']],
  })

  // 附带「是否已完成菜单初始化」，让超管一眼看出哪些租户是半成品（开通失败/历史数据）
  const ids = rows.map((t) => t.id)
  const menuCounts = ids.length
    ? ((await Menu.findAll({
        where: { tenantId: { [Op.in]: ids } },
        attributes: [[sequelize.fn('COUNT', sequelize.col('tenantId')), 'count'], 'tenantId'],
        group: ['tenantId'],
        raw: true,
      })) as unknown as Array<{ tenantId: number; count: string | number }>)
    : []
  const countByTenant = new Map<number, number>(menuCounts.map((row) => [Number(row.tenantId), Number(row.count)]))

  return {
    rows: rows.map((tenant) => ({ ...tenant.toJSON(), menuCount: countByTenant.get(tenant.id) ?? 0 })),
    total: count,
  }
}

export async function getTenantById(id: number) {
  const tenant = await Tenant.findByPk(id)
  if (!tenant) throw new AppError(404, '租户不存在')
  return tenant
}

/** 编辑租户基础信息与品牌（不改变状态） */
export async function updateTenant(id: number, data: { name?: string; brand?: TenantBrand; planId?: number; expiresAt?: Date | null; remark?: string }) {
  const tenant = await getTenantById(id)
  const payload: Record<string, unknown> = {}
  if (data.name?.trim()) payload.name = data.name.trim()
  if (data.brand) payload.settings = { ...(tenant.settings ?? {}), brand: normalizeBrand(data.brand) }
  if (data.planId !== undefined && data.planId !== null) payload.planId = Number(data.planId)
  if (data.expiresAt !== undefined) payload.expiresAt = data.expiresAt
  await tenant.update(payload)
  return tenant
}

/** 停用/启用/冻结租户：只改状态，绝不做物理删除（租户数据不可逆删除需单独设计） */
export async function setTenantStatus(id: number, status: number) {
  if (!TENANT_STATUSES.includes(status)) throw new AppError(400, '非法的租户状态')
  const tenant = await getTenantById(id)
  if (tenant.id === DEFAULT_TENANT_ID && status !== 1) {
    throw new AppError(400, '默认租户不可停用或冻结')
  }
  await tenant.update({ status })
  return { id: tenant.id, status: tenant.status }
}

/**
 * 开通租户（一个事务内完成：租户行 + 品牌 + 菜单副本 + 角色 + 根部门 + 管理员 + 订阅）。
 * 任一步失败整体回滚，不会留下「有租户没管理员」的半成品。
 */
export async function provisionTenant(input: ProvisionInput) {
  const name = input.name?.trim()
  const code = input.code?.trim().toLowerCase()
  const adminUsername = input.admin?.username?.trim()
  if (!name || !code) throw new AppError(400, '租户名称与编码不能为空')
  if (!CODE_RE.test(code)) throw new AppError(400, '租户编码需为小写字母开头的 2-30 位字母、数字或连字符')
  if (!adminUsername) throw new AppError(400, '管理员用户名不能为空')
  const strengthError = validatePasswordStrength(input.admin.password)
  if (strengthError) throw new AppError(400, strengthError)

  if (await Tenant.findOne({ where: { code } })) throw new AppError(409, '租户编码已存在')

  const requestedPlan = input.planId ? await Plan.findByPk(Number(input.planId)) : null
  if (input.planId && !requestedPlan) throw new AppError(404, '套餐不存在')
  // 未指定套餐时落到 free；连 free 都没有说明套餐数据不完整，直接失败比留下无订阅租户好排查
  const targetPlan = requestedPlan ?? (await Plan.findOne({ where: { code: 'free' } }))
  if (!targetPlan) throw new AppError(500, '缺少 free 默认套餐，无法为新租户建立订阅')

  return sequelize.transaction(async (tx: Transaction) => {
    const tenant = await Tenant.create(
      {
        name,
        code,
        status: 1,
        planId: targetPlan.id,
        expiresAt: input.expiresAt ?? null,
        settings: { brand: normalizeBrand(input.brand) },
      },
      { transaction: tx },
    )

    await copyTemplateMenus(tenant.id, { transaction: tx })
    const { adminRoleId } = await cloneRolesForTenant(tenant.id, { transaction: tx })
    if (!adminRoleId) throw new AppError(500, '未能确定新租户的管理员角色，开通中止')

    const dept = await Department.create({ parentId: 0, name: input.deptName?.trim() || name, sort: 0, status: 1, tenantId: tenant.id }, { transaction: tx })

    const admin = await User.create(
      {
        username: adminUsername,
        nickname: input.admin.nickname?.trim() || '管理员',
        email: input.admin.email || '',
        phone: input.admin.phone || '',
        // 明文传入，由 User 模型 beforeCreate 钩子 bcrypt 加密
        password: input.admin.password,
        status: 1,
        deptId: dept.id,
        tenantId: tenant.id,
        // 密码经平台管理员之手设置，首次登录强制改密
        passwordResetRequired: 1,
      },
      { transaction: tx },
    )
    await UserRole.create({ userId: admin.id, roleId: adminRoleId }, { transaction: tx })

    const now = new Date()
    const periodEnd = new Date(now.getTime() + 30 * 86400000)
    await Subscription.create(
      {
        tenantId: tenant.id,
        planId: targetPlan.id,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
      { transaction: tx },
    )
    await issueInvoice({ tenantId: tenant.id, plan: targetPlan, periodStart: now, periodEnd, transaction: tx })

    return { tenantId: tenant.id, adminUserId: admin.id, adminRoleId, deptId: dept.id, planId: targetPlan.id }
  })
}

/** 租户自助读取：品牌 + 套餐码，供前端登录后覆盖站点标题/Logo */
export async function getCurrentTenantInfo(tenantId: number) {
  const tenant = await Tenant.findByPk(tenantId)
  if (!tenant) throw new AppError(404, '租户不存在')
  const subscription = await Subscription.findOne({ where: { tenantId, status: 'active' }, order: [['id', 'DESC']] })
  const plan = subscription ? await Plan.findByPk(subscription.planId) : null
  const settings = (tenant.settings ?? {}) as { brand?: TenantBrand }
  return {
    id: tenant.id,
    name: tenant.name,
    code: tenant.code,
    status: tenant.status,
    brand: settings.brand ?? {},
    planCode: plan?.code ?? null,
  }
}
