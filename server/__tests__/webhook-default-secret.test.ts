// @vitest-environment node
/**
 * P4-T08 支付回调默认密钥伪造回归（CWE-798 / CWE-345）
 *
 * 证明：mock/bnpl 回调验签边界已 fail-closed——
 *   1) 用「旧默认密钥 'storefront_mock_webhook_secret'」伪造的签名被拒绝（401），
 *      订单不会被标记为已支付；
 *   2) 用「配置的密钥」（config.payment.webhookSecret，测试环境由 vitest env 注入）
 *      签名的正常回调被接受，订单成功置为 captured。
 *
 * 专属租户 987696，自建订单/支付，与其余套件零共享；beforeAll/afterAll 清理。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHmac } from 'crypto'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopOrder, ShopOrderPayment } from '../modules/shop/models/index.js'
import * as paymentService from '../modules/storefront/services/paymentService.js'
import config from '../config/index.js'

const TID = 987696
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const uniq = (): string => `wds${Date.now()}${Math.floor(Math.random() * 1e6)}`
const LEGACY_DEFAULT_SECRET = 'storefront_mock_webhook_secret'

interface Fixture {
  orderId: number
  orderNo: string
  providerRef: string
}

async function makeOrderAndPayment(): Promise<Fixture> {
  const orderNo = 'WDS' + uniq()
  const order = await ShopOrder.create({
    tenantId: TID,
    orderNo,
    channelId: 0,
    shopId: 0,
    buyer: { email: 'wds@example.com' },
    currency: 'USD',
    amount: 100,
    status: 'created',
    paymentStatus: 'initiated',
    email: 'wds@example.com',
    amountCents: 10000,
    subtotalCents: 10000,
  } as never)
  const providerRef = 'WDS_PAY_' + uniq()
  await ShopOrderPayment.create({
    tenantId: TID,
    orderId: order.id,
    orderNo,
    provider: 'mock',
    providerRef,
    sessionId: 'sess_' + uniq(),
    amountCents: 10000,
    currency: 'USD',
    status: 'initiated',
  } as never)
  return { orderId: order.id, orderNo, providerRef }
}

function rawBody(type: string, f: Fixture): Buffer {
  return Buffer.from(JSON.stringify({ type, orderNo: f.orderNo, providerRef: f.providerRef, currency: 'USD' }))
}

function signWith(raw: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(raw).digest('hex')
}

async function clean(): Promise<void> {
  await inTenant(async () => {
    await ShopOrderPayment.destroy({ where: { tenantId: TID } })
    await ShopOrder.destroy({ where: { tenantId: TID } })
  })
}

beforeAll(clean)
afterAll(clean)

describe('支付回调 · 默认密钥伪造 fail-closed', () => {
  it('用旧默认密钥伪造的 payment.succeeded 被拒绝（401），订单不被改单', async () => {
    await inTenant(async () => {
      const f = await makeOrderAndPayment()
      const raw = rawBody('payment.succeeded', f)
      const forgedSig = signWith(raw, LEGACY_DEFAULT_SECRET) // 攻击者猜到旧默认密钥

      const result = await paymentService.handleWebhook('mock', raw, forgedSig)
      const row = await ShopOrder.findByPk(f.orderId)

      expect(result.ok).toBe(false)
      expect(result.status).toBe(401)
      expect(row?.paymentStatus).toBe('initiated')
      expect(row?.status).toBe('created')
    })
  })

  it('用配置密钥签名的正常回调被接受，订单置为 captured', async () => {
    await inTenant(async () => {
      const f = await makeOrderAndPayment()
      const raw = rawBody('payment.succeeded', f)
      const validSig = paymentService.signWebhook(raw) // 使用配置的密钥

      const result = await paymentService.handleWebhook('mock', raw, validSig)
      const row = await ShopOrder.findByPk(f.orderId)

      expect(result.ok).toBe(true)
      expect(result.status).toBe(200)
      expect(row?.paymentStatus).toBe('captured')
      expect(row?.status).toBe('paid')
    })
  })

  it('即便攻击者知道配置密钥，缺少签名头仍被拒绝（无签名即拒）', async () => {
    await inTenant(async () => {
      const f = await makeOrderAndPayment()
      const raw = rawBody('payment.succeeded', f)
      const result = await paymentService.handleWebhook('mock', raw, '') // 空签名
      const row = await ShopOrder.findByPk(f.orderId)
      expect(result.status).toBe(401)
      expect(row?.paymentStatus).toBe('initiated')
    })
  })

  it('配置密钥确实取自配置（测试环境已注入非默认密钥，回归防御默认值回退）', () => {
    expect(config.payment?.webhookSecret).toBeTruthy()
    expect(config.payment?.webhookSecret).not.toBe(LEGACY_DEFAULT_SECRET)
  })
})
