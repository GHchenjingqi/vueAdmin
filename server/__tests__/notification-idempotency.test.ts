// @vitest-environment node
/**
 * 外部通知并发幂等回归
 *
 * 缺陷背景（2026-11-06 实证）：
 * - notifyRestock 先 findAll(waiting) 再无条件按 id 批量改 notified，并发两次调用
 *   双方都返回同一批收件人（total=2 / unique=1）-> 重复发到货通知。
 * - drainOutbox 先 findAll(pending/failed) 再直接调外部 provider，无抢占，
 *   并发两次调用 providerCalls=2 而库里只留 attempts=1 -> 邮件发两封、账务记一次。
 *
 * 两处均为「先查后改无 CAS + 外部副作用不可回滚」，修复后以 attempts / status
 * 条件更新做原子认领，只有认领成功者才能触发下游通知。
 * 全部数据使用独立租户 987662，与并行方 dev 数据零共享。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopOrderEmail, ShopRestockSubscription } from '../modules/shop/models/index.js'
import * as subscriptionService from '../modules/storefront/services/subscriptionService.js'
import * as orderMailService from '../modules/shop/services/orderMailService.js'

const TID = 987662
const uniq = (): string => `ni${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

let providerCalls = 0

async function seedRestock(skuId: number, email: string): Promise<void> {
  await ShopRestockSubscription.create({
    tenantId: TID,
    email,
    skuId,
    spuId: null,
    status: 'waiting',
    token: 'tok_' + uniq(),
    locale: 'en-US',
  } as never)
}

async function seedMail(overrides: Record<string, unknown> = {}): Promise<number> {
  const row = await ShopOrderEmail.create({
    tenantId: TID,
    orderId: 880000 + Math.floor(Math.random() * 100000),
    orderNo: 'NI' + uniq(),
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

beforeEach(async () => {
  providerCalls = 0
  await inTenant(async () => {
    await ShopRestockSubscription.destroy({ where: { tenantId: TID } })
    await ShopOrderEmail.destroy({ where: { tenantId: TID } })
  })
})

afterEach(() => {
  orderMailService.setMailProvider(null)
})

describe('到货通知 notifyRestock 并发认领', () => {
  it('并发两次补货：同一收件人只返回一次', async () => {
    await inTenant(async () => {
      const skuId = 970000 + Math.floor(Math.random() * 10000)
      await seedRestock(skuId, 'notify-a@test.dev')
      const [a, b] = await Promise.all([
        subscriptionService.notifyRestock(skuId, TID),
        subscriptionService.notifyRestock(skuId, TID),
      ])
      const emails = [...a, ...b].map((t) => t.email)
      expect(emails).toEqual(['notify-a@test.dev'])
      expect(new Set(emails).size).toBe(1)
      const row = await ShopRestockSubscription.findOne({ where: { tenantId: TID, skuId } })
      expect(row?.status).toBe('notified')
      expect(row?.notifiedAt).toBeTruthy()
    })
  })

  it('顺序重放不再返回已通知订阅', async () => {
    await inTenant(async () => {
      const skuId = 971000 + Math.floor(Math.random() * 10000)
      await seedRestock(skuId, 'notify-b@test.dev')
      expect(await subscriptionService.notifyRestock(skuId, TID)).toHaveLength(1)
      expect(await subscriptionService.notifyRestock(skuId, TID)).toHaveLength(0)
    })
  })

  it('多条订阅并发：每人恰好一次，不漏也不重', async () => {
    await inTenant(async () => {
      const skuId = 972000 + Math.floor(Math.random() * 10000)
      for (const n of ['c1', 'c2', 'c3']) await seedRestock(skuId, `${n}@test.dev`)
      const [a, b] = await Promise.all([
        subscriptionService.notifyRestock(skuId, TID),
        subscriptionService.notifyRestock(skuId, TID),
      ])
      const emails = [...a, ...b].map((t) => t.email)
      expect(emails).toHaveLength(3)
      expect(new Set(emails).size).toBe(3)
    })
  })
})

describe('订单邮件 drainOutbox 并发认领', () => {
  it('并发两次 drain：外部 provider 只调用一次，账务只记一次', async () => {
    orderMailService.setMailProvider(async () => {
      providerCalls++
    })
    await inTenant(async () => {
      await seedMail()
      const [r1, r2] = await Promise.all([
        orderMailService.drainOutbox({ ignoreSchedule: true }),
        orderMailService.drainOutbox({ ignoreSchedule: true }),
      ])
      expect(providerCalls).toBe(1)
      expect(r1.sent + r2.sent).toBe(1)
      const row = await ShopOrderEmail.findOne({ where: { tenantId: TID } })
      expect(row?.status).toBe('sent')
      expect(Number(row?.attempts)).toBe(1)
    })
  })

  it('单 worker 正常发送口径不变', async () => {
    orderMailService.setMailProvider(async () => {
      providerCalls++
    })
    await inTenant(async () => {
      await seedMail()
      const r = await orderMailService.drainOutbox({ ignoreSchedule: true })
      expect(r).toEqual({ scanned: 1, sent: 1, failed: 0, dead: 0 })
      expect(providerCalls).toBe(1)
      const row = await ShopOrderEmail.findOne({ where: { tenantId: TID } })
      expect(row?.status).toBe('sent')
      expect(Number(row?.attempts)).toBe(1)
      expect(row?.sentAt).toBeTruthy()
    })
  })

  it('发送失败保留有界重试口径', async () => {
    orderMailService.setMailProvider(async () => {
      providerCalls++
      throw new Error('smtp down')
    })
    await inTenant(async () => {
      await seedMail()
      const before = Date.now()
      const r = await orderMailService.drainOutbox({ ignoreSchedule: true })
      expect(r.failed).toBe(1)
      expect(providerCalls).toBe(1)
      const row = await ShopOrderEmail.findOne({ where: { tenantId: TID } })
      expect(row?.status).toBe('failed')
      expect(Number(row?.attempts)).toBe(1)
      expect(row?.lastError).toBe('smtp down')
      expect(new Date(row?.nextAttemptAt as Date).getTime()).toBeGreaterThan(before)
    })
  })

  it('达到最大重试次数后置 dead', async () => {
    orderMailService.setMailProvider(async () => {
      throw new Error('smtp down')
    })
    await inTenant(async () => {
      await seedMail({ attempts: 4, status: 'failed' })
      const r = await orderMailService.drainOutbox({ ignoreSchedule: true })
      expect(r.dead).toBe(1)
      const row = await ShopOrderEmail.findOne({ where: { tenantId: TID } })
      expect(row?.status).toBe('dead')
      expect(Number(row?.attempts)).toBe(5)
    })
  })

  it('运营 retryMail 后可再次发送（既有路径不回归）', async () => {
    await inTenant(async () => {
      const id = await seedMail({ attempts: 5, status: 'dead' })
      const retried = await orderMailService.retryMail(id)
      expect(retried?.status).toBe('pending')
      expect(Number(retried?.attempts)).toBe(0)
      orderMailService.setMailProvider(async () => {
        providerCalls++
      })
      const r = await orderMailService.drainOutbox({ ignoreSchedule: true })
      expect(r.sent).toBe(1)
      expect(providerCalls).toBe(1)
      const row = await ShopOrderEmail.findByPk(id)
      expect(row?.status).toBe('sent')
      expect(Number(row?.attempts)).toBe(1)
    })
  })
})
