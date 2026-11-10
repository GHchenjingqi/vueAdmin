// @vitest-environment node
/**
 * 订单邮件 outbox 投递链路实证（先跑红坐实缺陷，修复后转绿）：
 * - E1：outbox 只有后台手动 drain API，没有任何扫描器自动驱动 → 入队邮件永不自动发送，
 *   有界指数退避重试形同空转；新增扫描器须跨租户投递（不能只跑 tenant 1）。
 * - E2：retryMail 允许把 status='sent' 的邮件重新入队 → 同一事件重复发信（外部邮件不可回滚）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopOrderEmail } from '../modules/shop/models/index.js'
import * as orderMailService from '../modules/shop/services/orderMailService.js'

const TID_A = 987701
const TID_B = 987702
const uniq = (): string => `oms${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(tid: number, fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: tid }, fn)

let providerCalls = 0

async function seedMail(tenantId: number, overrides: Record<string, unknown> = {}): Promise<number> {
  const row = await ShopOrderEmail.create({
    tenantId,
    orderId: 990000 + Math.floor(Math.random() * 100000),
    orderNo: 'OMS' + uniq(),
    type: 'confirmed',
    dedupeKey: '',
    toEmail: `buyer-${uniq()}@test.dev`,
    subject: 'Order confirmed',
    bodyText: 'body',
    currency: 'USD',
    amountCents: 1000,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: new Date(Date.now() - 1000),
    lastError: null,
    sentAt: null,
    ...overrides,
  } as never)
  return row.id
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

beforeEach(async () => {
  providerCalls = 0
  orderMailService.setMailProvider(async () => {
    providerCalls++
  })
  await inTenant(TID_A, () => ShopOrderEmail.destroy({ where: { tenantId: TID_A } }))
  await inTenant(TID_B, () => ShopOrderEmail.destroy({ where: { tenantId: TID_B } }))
})

afterEach(async () => {
  orderMailService.setMailProvider(null)
  await inTenant(TID_A, () => ShopOrderEmail.destroy({ where: { tenantId: TID_A } }))
  await inTenant(TID_B, () => ShopOrderEmail.destroy({ where: { tenantId: TID_B } }))
})

describe('E1：outbox 缺少自动投递扫描器', () => {
  it('orderMailService 必须导出 startOrderMailScanner（修复前 app.ts 无任何注册点）', async () => {
    const mod = await import('../modules/shop/services/orderMailService.js')
    expect(typeof (mod as Record<string, unknown>).startOrderMailScanner).toBe('function')
  })

  it('启动扫描器后到期邮件被自动投递，且只发一次', async () => {
    const id = await inTenant(TID_A, () => seedMail(TID_A))
    const stop = orderMailService.startOrderMailScanner(25, [TID_A])
    try {
      await wait(220)
    } finally {
      stop()
    }
    const row = await ShopOrderEmail.findByPk(id)
    expect(row?.status).toBe('sent')
    expect(providerCalls).toBe(1)
  })

  it('扫描器跨租户投递：两个租户各一封到期邮件都要发出', async () => {
    const idA = await inTenant(TID_A, () => seedMail(TID_A))
    const idB = await inTenant(TID_B, () => seedMail(TID_B))
    const stop = orderMailService.startOrderMailScanner(25, [TID_A, TID_B])
    try {
      await wait(220)
    } finally {
      stop()
    }
    const [a, b] = await Promise.all([ShopOrderEmail.findByPk(idA), ShopOrderEmail.findByPk(idB)])
    expect(a?.status).toBe('sent')
    expect(b?.status).toBe('sent')
    expect(providerCalls).toBe(2)
  })
})

describe('E2：retryMail 重投已发送邮件', () => {
  it('已 sent 的邮件不得重新入队，重复 drain 不得再发第二封', async () => {
    await inTenant(TID_A, async () => {
      const id = await seedMail(TID_A)
      await orderMailService.drainOutbox({ ignoreSchedule: true })
      expect(providerCalls).toBe(1)
      const retried = await orderMailService.retryMail(id)
      expect(retried).toBeNull()
      await orderMailService.drainOutbox({ ignoreSchedule: true })
      expect(providerCalls).toBe(1)
    })
  })

  it('dead 邮件仍可由运营重新入队', async () => {
    await inTenant(TID_A, async () => {
      const id = await seedMail(TID_A, { status: 'dead', attempts: 5 })
      const retried = await orderMailService.retryMail(id)
      expect(retried).not.toBeNull()
      expect(retried?.status).toBe('pending')
      expect(Number(retried?.attempts)).toBe(0)
    })
  })
})
