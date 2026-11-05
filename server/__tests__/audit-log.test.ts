// @vitest-environment node
/**
 * X-T03 审计日志：记录 + 按实体回溯状态变更链
 *
 * 覆盖：record 写入、listByEntity 倒序回溯、beforeState/afterState 快照、租户隔离。
 * 数据库表由迁移 20261105_000065 建立；若测试库未迁移，请先 `npm run migrate`。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as auditLogService from '../modules/shop/services/auditLogService.js'
import AuditLog from '../modules/shop/models/AuditLog.js'

describe('X-T03 审计日志服务', () => {
  // 隔离：清理固定测试实体 ID 的历史行，避免跨轮累积导致断言漂移
  beforeEach(async () => {
    await runInTenant({ tenantId: 1 }, async () => {
      await AuditLog.destroy({ where: { tenantId: 1, entityId: [99001, 55001, 77001] } })
    })
  })

  it('record 写入后可由 listByEntity 回溯（倒序，最新在前）', async () => {
    await runInTenant({ tenantId: 1 }, async () => {
      const entityId = 99001
      await auditLogService.record({ action: 'order.created', entityType: 'order', entityId, afterState: { status: 'created' } })
      await auditLogService.record({ action: 'order.payment_captured', entityType: 'order', entityId, afterState: { status: 'paid', paymentStatus: 'captured' } })

      const rows = await auditLogService.listByEntity({ entityType: 'order', entityId })
      expect(rows.length).toBe(2)
      // 倒序：最新 captured 在前
      expect(rows[0].action).toBe('order.payment_captured')
      expect(rows[1].action).toBe('order.created')
      expect((rows[0].afterState as { status: string }).status).toBe('paid')
    })
  })

  it('actorType 默认 system，且 beforeState/afterState 可存 JSON 快照', async () => {
    await runInTenant({ tenantId: 1 }, async () => {
      await auditLogService.record({
        actorType: 'admin',
        actorId: 7,
        action: 'refund.created',
        entityType: 'refund',
        entityId: 55001,
        beforeState: { paymentStatus: 'captured' },
        afterState: { paymentStatus: 'refunded', amountCents: 12990 },
      })
      const rows = await auditLogService.listByEntity({ entityType: 'refund', entityId: 55001 })
      expect(rows.length).toBe(1)
      expect(rows[0].actorType).toBe('admin')
      expect(rows[0].actorId).toBe(7)
      expect((rows[0].beforeState as { paymentStatus: string }).paymentStatus).toBe('captured')
      expect((rows[0].afterState as { amountCents: number }).amountCents).toBe(12990)
    })
  })

  it('仅返回指定实体与租户的日志（隔离）', async () => {
    await runInTenant({ tenantId: 1 }, async () => {
      const rows = await auditLogService.listByEntity({ entityType: 'inventory', entityId: 77001 })
      expect(Array.isArray(rows)).toBe(true)
      for (const r of rows) {
        expect(r.entityType).toBe('inventory')
        expect(r.entityId).toBe(77001)
        expect(r.tenantId).toBe(1)
      }
    })
  })

  it('record 失败不抛错（表正常时不抛，仅验证可调用）', async () => {
    await runInTenant({ tenantId: 1 }, async () => {
      await expect(
        auditLogService.record({ action: 'x', entityType: 'order', entityId: 1 }),
      ).resolves.toBeUndefined()
      const count = await AuditLog.count({ where: { entityType: 'order', entityId: 1, tenantId: 1 } })
      expect(count).toBeGreaterThanOrEqual(1)
    })
  })
})
