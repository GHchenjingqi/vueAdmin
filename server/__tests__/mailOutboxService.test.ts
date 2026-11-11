import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 营销邮件 outbox 投递扫描器测试（mock 模型层）：
 * - 只处理 pending 行，sent/failed 跳过
 * - CAS 抢占：仅当仍为 pending 时才发送（先标 sent，失败回退 failed）
 * - 发送成功：标 sent + sentAt
 * - 发送失败：标 failed + error（截断 500），sentAt 清空
 */

const hoist = vi.hoisted(() => {
  const outbox: Record<string, unknown>[] = []
  let idSeq = 1
  let sentPayloads: { to: string; subject: string; text: string }[] = []
  let failNext = false
  return { outbox, idSeq, sentPayloads, failNext }
})

vi.mock('../modules/tenant/context.js', () => ({
  getTenantContext: () => ({ tenantId: 1 }),
  runInTenant: async (_ctx: unknown, fn: () => unknown) => fn(),
}))

vi.mock('../modules/shop/services/orderMailService.js', () => ({
  getMailProvider: () => async (msg: { to: string; subject: string; text: string }) => {
    if (hoist.failNext) throw new Error('SMTP down')
    hoist.sentPayloads.push(msg)
  },
}))

vi.mock('../modules/shop/models/index.js', () => ({
  ShopMailOutbox: {
    findAll: vi.fn(async (args: { where: Record<string, unknown>; limit?: number }) =>
      hoist.outbox
        .filter((r) => r.tenantId === 1 && r.status === args.where.status)
        .slice(0, args.limit ?? 50)
        .map((r) => ({ ...r }))),
    update: vi.fn(async (patch: Record<string, unknown>, opts: { where: Record<string, unknown> }) => {
      const where = opts.where
      const target = hoist.outbox.find((r) => r.id === where.id && r.tenantId === where.tenantId && r.status === where.status)
      if (!target) return [0]
      Object.assign(target, patch)
      return [1]
    }),
  },
}))

vi.mock('../utils/mailer.js', () => ({ getTransporter: vi.fn() }))

describe('mailOutboxService · 营销邮件投递扫描器', () => {
  beforeEach(() => {
    hoist.outbox.length = 0
    hoist.sentPayloads = []
    hoist.failNext = false
  })

  it('发送 pending 邮件并标 sent', async () => {
    hoist.outbox.push({ id: 1, tenantId: 1, toEmail: 'a@b.c', subject: 's', bodyText: 't', status: 'pending' })
    const { drainMailOutbox } = await import('../modules/storefront/services/mailOutboxService.js')
    const r = await drainMailOutbox({})
    expect(r.scanned).toBe(1)
    expect(r.sent).toBe(1)
    expect(r.failed).toBe(0)
    expect(hoist.sentPayloads).toHaveLength(1)
    expect(hoist.sentPayloads[0].to).toBe('a@b.c')
    expect(hoist.outbox[0].status).toBe('sent')
    expect(hoist.outbox[0].sentAt).toBeTruthy()
  })

  it('发送失败标 failed 并记 error', async () => {
    hoist.outbox.push({ id: 2, tenantId: 1, toEmail: 'x@y.z', subject: 's2', bodyText: 't2', status: 'pending' })
    hoist.failNext = true
    const { drainMailOutbox } = await import('../modules/storefront/services/mailOutboxService.js')
    const r = await drainMailOutbox({})
    expect(r.sent).toBe(0)
    expect(r.failed).toBe(1)
    expect(hoist.outbox[0].status).toBe('failed')
    expect(hoist.outbox[0].error).toContain('SMTP down')
    expect(hoist.outbox[0].sentAt).toBeNull()
  })

  it('跳过非 pending 行（sent/failed）', async () => {
    hoist.outbox.push({ id: 3, tenantId: 1, toEmail: 'a@b.c', subject: 's', bodyText: 't', status: 'sent' })
    hoist.outbox.push({ id: 4, tenantId: 1, toEmail: 'a@b.c', subject: 's', bodyText: 't', status: 'failed' })
    const { drainMailOutbox } = await import('../modules/storefront/services/mailOutboxService.js')
    const r = await drainMailOutbox({})
    expect(r.scanned).toBe(0)
    expect(hoist.sentPayloads).toHaveLength(0)
  })
})
