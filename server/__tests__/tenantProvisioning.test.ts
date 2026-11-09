// @vitest-environment node
/**
 * 租户开通与状态流转（T11）单元测试
 *
 * 关注点在编排本身：校验顺序、事务里每一步都做了、失败时错误码是否可辨识。
 * 菜单/角色复制的正确性由 menuTemplateService.test.ts 覆盖，这里直接 mock 掉。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  tenantCreate,
  subscriptionCreate,
  userCreate,
  deptCreate,
  userRoleCreate,
  planFindByPk,
  planFindOne,
  issueInvoice,
  copyTemplateMenus,
  cloneRolesForTenant,
  tenantFindOne,
  tenantFindByPkStub,
} = vi.hoisted(() => ({
  tenantCreate: vi.fn(),
  subscriptionCreate: vi.fn(),
  userCreate: vi.fn(),
  deptCreate: vi.fn(),
  userRoleCreate: vi.fn(),
  planFindByPk: vi.fn(),
  planFindOne: vi.fn(),
  issueInvoice: vi.fn(),
  copyTemplateMenus: vi.fn(),
  cloneRolesForTenant: vi.fn(),
  tenantFindOne: vi.fn(),
  tenantFindByPkStub: vi.fn(),
}))

vi.mock('../config/database.js', () => ({
  default: {
    // 开通流程要求真事务；测试里把回调直接跑一遍，回滚行为交给 MySQL 本身
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb({ fakeTransaction: true }),
    fn: vi.fn((name: string) => ({ fn: name })),
    col: vi.fn((name: string) => name),
  },
}))

vi.mock('../modules/tenant/models/Tenant.js', () => ({
  default: { create: tenantCreate, findOne: tenantFindOne, findByPk: tenantFindByPkStub, findAndCountAll: vi.fn() },
}))
vi.mock('../models/Menu.js', () => ({ default: { findAll: vi.fn().mockResolvedValue([]) } }))
vi.mock('../models/Department.js', () => ({ default: { create: deptCreate } }))
vi.mock('../models/User.js', () => ({ default: { create: userCreate } }))
vi.mock('../models/UserRole.js', () => ({ default: { create: userRoleCreate } }))
vi.mock('../modules/billing/models/Plan.js', () => ({ default: { findByPk: planFindByPk, findOne: planFindOne } }))
vi.mock('../modules/billing/models/Subscription.js', () => ({ default: { create: subscriptionCreate, findOne: vi.fn() } }))
vi.mock('../modules/billing/services/invoiceService.js', () => ({ issueInvoice }))
vi.mock('../modules/tenant/services/menuTemplateService.js', () => ({ copyTemplateMenus, cloneRolesForTenant }))
vi.mock('../services/authService.js', () => ({
  validatePasswordStrength: (password: string) => (String(password || '').length < 8 ? '密码长度不能少于8位' : null),
}))

const { provisionTenant, setTenantStatus } = await import('../modules/tenant/services/tenantService.js')
const { DEFAULT_TENANT_ID } = await import('../modules/tenant/constants.js')

const VALID = {
  name: '_acme 测试租户',
  code: 'acme',
  admin: { username: 'acme_admin', password: 'Abc12345!' },
}

describe('tenantService.provisionTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tenantFindOne.mockResolvedValue(null)
    planFindOne.mockResolvedValue({ id: 1, code: 'free' })
    tenantCreate.mockResolvedValue({ id: 42, toJSON: () => ({ id: 42 }) })
    deptCreate.mockResolvedValue({ id: 7 })
    userCreate.mockResolvedValue({ id: 88 })
    userRoleCreate.mockResolvedValue({})
    subscriptionCreate.mockResolvedValue({})
    copyTemplateMenus.mockResolvedValue(new Map())
    cloneRolesForTenant.mockResolvedValue({ adminRoleId: 55, roleIds: [55, 56] })
    issueInvoice.mockResolvedValue({ id: 9 })
  })

  it('一次开通把租户、菜单副本、角色、部门、管理员、订阅、账单全部建齐', async () => {
    const result = await provisionTenant(VALID as any)

    expect(result).toEqual({ tenantId: 42, adminUserId: 88, adminRoleId: 55, deptId: 7, planId: 1 })
    expect(copyTemplateMenus).toHaveBeenCalledWith(42, { transaction: { fakeTransaction: true } })
    expect(cloneRolesForTenant).toHaveBeenCalledWith(42, { transaction: { fakeTransaction: true } })

    // 管理员必须落在新租户与根部门上，并要求首登改密
    expect(userCreate.mock.calls[0][0]).toMatchObject({ username: 'acme_admin', tenantId: 42, deptId: 7, passwordResetRequired: 1 })
    expect(userRoleCreate).toHaveBeenCalledWith({ userId: 88, roleId: 55 }, { transaction: { fakeTransaction: true } })
    expect(subscriptionCreate.mock.calls[0][0]).toMatchObject({ tenantId: 42, planId: 1, status: 'active' })
    expect(issueInvoice).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 42, periodStart: expect.any(Date), periodEnd: expect.any(Date) }))
  })

  it('品牌设置随租户行落库，空白字段被剔除', async () => {
    await provisionTenant({ ...VALID, brand: { title: ' 极风科技 ', logo: '', color: '#1677ff' } } as any)
    expect(tenantCreate.mock.calls[0][0].settings).toEqual({ brand: { title: '极风科技', color: '#1677ff' } })
  })

  it('指定套餐不存在时 404，且不留下租户行', async () => {
    planFindByPk.mockResolvedValue(null)
    await expect(provisionTenant({ ...VALID, planId: 999 } as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(tenantCreate).not.toHaveBeenCalled()
  })

  it('未指定套餐时落到 free，连 free 都没有则明确失败', async () => {
    expect((await provisionTenant(VALID as any)).planId).toBe(1)

    vi.clearAllMocks()
    planFindOne.mockResolvedValue(null)
    await expect(provisionTenant(VALID as any)).rejects.toMatchObject({ statusCode: 500, message: expect.stringContaining('free') })
    expect(tenantCreate).not.toHaveBeenCalled()
  })

  it('租户编码重复时 409 并停止', async () => {
    tenantFindOne.mockResolvedValue({ id: 1 })
    await expect(provisionTenant(VALID as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(tenantCreate).not.toHaveBeenCalled()
  })

  it('编码/名称/管理员/密码强度逐项校验', async () => {
    await expect(provisionTenant({ ...VALID, name: '' } as any)).rejects.toMatchObject({ statusCode: 400 })
    await expect(provisionTenant({ ...VALID, code: 'Acme Corp' } as any)).rejects.toMatchObject({ statusCode: 400 })
    await expect(provisionTenant({ ...VALID, admin: { username: '', password: 'Abc12345!' } } as any)).rejects.toMatchObject({ statusCode: 400 })
    await expect(provisionTenant({ ...VALID, admin: { username: 'a', password: 'short' } } as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(tenantCreate).not.toHaveBeenCalled()
  })

  it('未能确定管理员角色时中止，避免开通出登录即空白的租户', async () => {
    cloneRolesForTenant.mockResolvedValue({ adminRoleId: null, roleIds: [] })
    await expect(provisionTenant(VALID as any)).rejects.toMatchObject({ statusCode: 500 })
    expect(userCreate).not.toHaveBeenCalled()
  })

  it('编码统一小写入库', async () => {
    await provisionTenant({ ...VALID, code: 'ACME-Shanghai' } as any)
    expect(tenantCreate.mock.calls[0][0].code).toBe('acme-shanghai')
  })
})

describe('tenantService.setTenantStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('默认租户不可停用或冻结', async () => {
    const update = vi.fn()
    tenantFindByPkStub.mockResolvedValue({ id: DEFAULT_TENANT_ID, status: 1, update })
    await expect(setTenantStatus(DEFAULT_TENANT_ID, 0)).rejects.toMatchObject({ statusCode: 400 })
    expect(update).not.toHaveBeenCalled()
  })

  it('非法状态值直接拒绝', async () => {
    tenantFindByPkStub.mockResolvedValue({ id: 42, status: 1, update: vi.fn() })
    await expect(setTenantStatus(42, 9)).rejects.toMatchObject({ statusCode: 400 })
  })
})
