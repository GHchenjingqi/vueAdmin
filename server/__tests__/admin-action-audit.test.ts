// @vitest-environment node
/**
 * 后台高敏操作审计覆盖度普查（方向1）实证：
 * - recordAdminAction 统一入口必须把操作人/租户/动作落到 AuditLog；
 * - 审计内容只含字段名与状态字面量，绝不落请求体里的敏感值；
 * - 各高敏 controller 均接入该入口（覆盖度矩阵见 server/docs/reports/admin-audit-coverage-audit.md）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Request } from 'express'
import { runInTenant } from '../modules/tenant/context.js'
import { AuditLog } from '../modules/shop/models/index.js'
import { recordAdminAction } from '../modules/shop/services/auditLogService.js'

const TID = 987801
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const ACTIONS = [
  'payment.channels_updated',
  'order.manually_marked_paid',
  'order.manually_shipped',
  'order.manually_cancelled',
  'rma.approved',
  'rma.rejected',
]

beforeEach(async () => {
  await inTenant(() => AuditLog.destroy({ where: { tenantId: TID } }))
})

afterEach(async () => {
  await inTenant(() => AuditLog.destroy({ where: { tenantId: TID } }))
  vi.restoreAllMocks()
})

describe('后台高敏操作审计留痕', () => {
  it('recordAdminAction 写入操作人、租户、动作与实体 ID', async () => {
    await inTenant(async () => {
      const req = { user: { id: 42, username: 'admin' }, params: { id: '123' } } as unknown as Request
      await recordAdminAction(req, 'order.manually_marked_paid', 'order', 123, { status: 'paid' })
      const row = await AuditLog.findOne({ where: { tenantId: TID, action: 'order.manually_marked_paid' } })
      expect(row).not.toBeNull()
      expect(Number(row!.actorId)).toBe(42)
      expect(row!.actorType).toBe('admin')
      expect(Number(row!.entityId)).toBe(123)
      expect(row!.entityType).toBe('order')
    })
  })

  it('审计 afterState 只含非敏感字段，不落商户标识等请求体值', async () => {
    await inTenant(async () => {
      const req = { user: { id: 7 }, body: { accounts: { paypal: { merchantId: 'RAW_MERCHANT_SECRET' } } } } as unknown as Request
      await recordAdminAction(req, 'payment.channels_updated', 'config', null, {
        enabled: ['paypal'],
        accountProviders: ['paypal'],
      })
      const row = await AuditLog.findOne({ where: { tenantId: TID, action: 'payment.channels_updated' } })
      expect(row).not.toBeNull()
      const blob = JSON.stringify(row!.afterState)
      expect(blob).toContain('paypal')
      expect(blob).not.toContain('RAW_MERCHANT_SECRET')
      expect(blob).not.toContain('merchantId')
    })
  })

  it('审计写入失败不阻断业务主流程（record 内部仅告警）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const spy = vi.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('db down') as never)
    await inTenant(async () => {
      await expect(recordAdminAction({} as Request, 'rma.approved', 'refund', 9, { status: 'approved' })).resolves.toBeUndefined()
    })
    expect(warn).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('覆盖度矩阵（本轮接入的高敏动作名）', () => {
  it('六个高敏动作均已定义并可写入', async () => {
    await inTenant(async () => {
      for (const action of ACTIONS) {
        await recordAdminAction({ user: { id: 1 } } as unknown as Request, action, 'config', null, { status: 'ok' })
      }
      const count = await AuditLog.count({ where: { tenantId: TID, action: ACTIONS } })
      expect(count).toBe(ACTIONS.length)
    })
  })
})
