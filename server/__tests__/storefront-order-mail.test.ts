// @vitest-environment node
/**
 * P3-T17 订单邮件通知 / 门禁 T-12「邮件口径」实证
 *
 * 断言：支付/发货/退款三处自动入队；重复事件不重复发信；
 *       金额按订单快照币种渲染且后台/订单后续改动不漂移；
 *       邮件不含支付凭据；失败有界重试 + dead 后人工重发；租户隔离。
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import * as orderService from '../modules/shop/services/orderService.js'
import * as refundService from '../modules/shop/services/refundService.js'
import * as orderMailService from '../modules/shop/services/orderMailService.js'
import { ShopOrder } from '../modules/shop/models/index.js'
import * as checkoutService from '../modules/storefront/services/checkoutService.js'
import * as paymentService from '../modules/storefront/services/paymentService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'

const TID = 1
const uniq = (): string => `ml${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)
const inTenant2 = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: 2 }, fn)

let skuId = 0
let site: StorefrontSite

beforeAll(async () => {
  await inTenant(async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'Mail Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'Mail Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'Mail WH ' + uniq(), type: 'overseas', country: 'US' })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'Mail Wig ' + uniq(), 'zh-CN': '邮件测试商品' },
      description: { 'en-US': 'mail fixture' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'MLSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 100 })
    await inventoryService.adjust(sku.id, warehouse.id, 1000)
    site = { tenantId: TID, channelId: null, shopId: null, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

afterEach(() => {
  orderMailService.setMailProvider(null)
  refundService.setRefundProvider(null)
})

/** 造一笔真实已支付订单（Webhook 成功会自动入队 confirmed 邮件） */
async function paidOrder(email = `mail-${uniq()}@example.com`): Promise<{ id: number; orderNo: string; amountCents: number }> {
  const order = await checkoutService.createOrder(site, { items: [{ skuId, qty: 1 }], email })
  const session = await paymentService.createSession(site, order.id)
  const raw = Buffer.from(JSON.stringify({ type: 'payment.succeeded', orderNo: order.orderNo, providerRef: session.providerRef, currency: 'USD' }))
  const result = await paymentService.handleWebhook('mock', raw, paymentService.signWebhook(raw))
  if (!result.ok) throw new Error('支付回写失败')
  return { id: order.id, orderNo: order.orderNo, amountCents: order.amountCents }
}

describe('P3-T17 三类邮件自动入队与幂等', () => {
  it('支付成功 Webhook 自动入队确认邮件，正文按订单快照 USD 渲染且不含支付凭据', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      const mails = await orderMailService.listOrderMails(order.id)
      expect(mails).toHaveLength(1)
      expect(mails[0].type).toBe('confirmed')
      expect(mails[0].currency).toBe('USD')
      expect(mails[0].status).toBe('pending')
      expect(mails[0].bodyText).toContain('USD')
      expect(mails[0].bodyText).toContain('$')
      expect(mails[0].bodyText).toContain(order.orderNo)
      expect(mails[0].amountCents).toBe(order.amountCents)
      for (const secret of ['accessToken', 'providerRef', 'cardNumber', 'cvv', 'CVV', 'password']) {
        expect(mails[0].bodyText).not.toContain(secret)
      }
    })
  })

  it('重复 Webhook 不重复入队（幂等键 = 订单 + 类型）', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      // 换一个 providerRef 重复投递：订单已 captured，主链路幂等返回，不应二次入队
      const raw = Buffer.from(JSON.stringify({ type: 'payment.succeeded', orderNo: order.orderNo, providerRef: 'dup-ref-' + uniq(), currency: 'USD' }))
      await paymentService.handleWebhook('mock', raw, paymentService.signWebhook(raw))
      expect(await orderMailService.listOrderMails(order.id)).toHaveLength(1)
    })
  })

  it('发货入队 shipped 邮件并带承运商 / 运单号，同一运单号幂等', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      await orderService.ship(order.id, { carrier: 'DHL', trackingNo: 'TRK-' + uniq() })
      const mails = await orderMailService.listOrderMails(order.id)
      const shipped = mails.filter((m) => m.type === 'shipped')
      expect(shipped).toHaveLength(1)
      expect(shipped[0].dedupeKey).toMatch(/^TRK-/)
      expect(shipped[0].bodyText).toContain('DHL')
      expect(shipped[0].bodyText).toContain(shipped[0].dedupeKey)

      const again = await orderMailService.enqueueOrderMail({
        orderId: order.id, type: 'shipped', dedupeKey: shipped[0].dedupeKey, trackingNo: shipped[0].dedupeKey, carrier: 'DHL',
      })
      expect(again?.id).toBe(shipped[0].id)
      expect(await orderMailService.listOrderMails(order.id)).toHaveLength(2)
    })
  })

  it('部分退款入队 refunded 邮件，金额与币种取退款流水 / 订单快照；幂等重放不重复发信', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      const key = 'mail-refund-' + uniq()
      await refundService.createRefund({ orderId: order.id, amountCents: 1000, idempotencyKey: key })
      await refundService.createRefund({ orderId: order.id, amountCents: 1000, idempotencyKey: key })
      const mails = await orderMailService.listOrderMails(order.id)
      const refunded = mails.filter((m) => m.type === 'refunded')
      expect(refunded).toHaveLength(1)
      expect(refunded[0].amountCents).toBe(1000)
      expect(refunded[0].currency).toBe('USD')
      expect(refunded[0].bodyText).toContain('Refund amount: $10.00 USD')
    })
  })

  it('订单无收件邮箱时跳过入队，不产生无收件人的邮件', async () => {
    await inTenant(async () => {
      const order = await checkoutService.createOrder(site, { items: [{ skuId, qty: 1 }] })
      const made = await orderMailService.enqueueOrderMail({ orderId: order.id, type: 'confirmed' })
      expect(made).toBeNull()
      expect(await orderMailService.listOrderMails(order.id)).toHaveLength(0)
    })
  })
})

describe('T-12 邮件币种快照不随后台配置 / 订单后续变化漂移', () => {
  it('入队后把订单币种改成 CNY，实际发出的正文仍是入队时的 USD 快照', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      const before = (await orderMailService.listOrderMails(order.id))[0]
      const sent: { to: string; subject: string; text: string }[] = []
      orderMailService.setMailProvider((msg) => {
        sent.push(msg)
      })
      try {
        await ShopOrder.update({ currency: 'CNY' }, { where: { id: order.id, tenantId: TID } })
        const result = await orderMailService.drainOutbox({ orderId: order.id, ignoreSchedule: true })
        expect(result.sent).toBe(1)
        expect(sent).toHaveLength(1)
        expect(sent[0].text).toBe(before.bodyText)
        expect(sent[0].text).toContain('USD')
        expect(sent[0].text).toContain('$')
        expect(sent[0].text).not.toContain('CNY')
        const after = (await orderMailService.listOrderMails(order.id))[0]
        expect(after.currency).toBe('USD')
        expect(after.status).toBe('sent')
      } finally {
        await ShopOrder.update({ currency: 'USD' }, { where: { id: order.id, tenantId: TID } })
      }
    })
  })

  it('金额格式化只依赖传入的 ISO 币种，不做任何汇率换算', () => {
    expect(orderMailService.formatOrderAmount(129900, 'USD')).toBe('$1,299.00 USD')
    expect(orderMailService.formatOrderAmount(129900, 'cny')).toBe('¥1,299.00 CNY')
    expect(orderMailService.formatOrderAmount(129900, 'EUR')).toContain('EUR')
    expect(orderMailService.formatOrderAmount(129900, 'EUR')).toContain('1.299,00')
  })

  it('渲染做单行化裁剪，订单号里的邮件头注入不进入主题', () => {
    const rendered = orderMailService.renderOrderMail({
      orderNo: 'SO-1\r\nBcc: attacker@example.com',
      email: 'a@example.com',
      currency: 'USD',
      amountCents: 1000,
      type: 'confirmed',
      lines: [{ title: 'Wig\nBcc: evil', qty: 1, lineTotalCents: 1000 }],
    })
    expect(rendered.subject).not.toMatch(/[\r\n]/)
    expect(rendered.subject.length).toBeLessThan(255)
    expect(rendered.text).toContain('Wig Bcc: evil') // CRLF 被单行化，无法注入新邮件头
    expect(rendered.text.split('\n').every((l) => !l.includes('\r'))).toBe(true)
  })
})

describe('发送失败可重试与租户隔离', () => {
  it('首次失败 → failed 且记录原因；立即重试成功 → sent', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      let calls = 0
      orderMailService.setMailProvider(() => {
        calls++
        if (calls === 1) throw new Error('SMTP 502')
      })
      const first = await orderMailService.drainOutbox({ orderId: order.id, ignoreSchedule: true })
      expect(first).toMatchObject({ scanned: 1, failed: 1, sent: 0 })
      const failed = (await orderMailService.listOrderMails(order.id))[0]
      expect(failed.status).toBe('failed')
      expect(failed.attempts).toBe(1)
      expect(failed.lastError).toContain('SMTP 502')
      expect(failed.nextAttemptAt).toBeInstanceOf(Date)

      const second = await orderMailService.drainOutbox({ orderId: order.id, ignoreSchedule: true })
      expect(second.sent).toBe(1)
      expect((await orderMailService.listOrderMails(order.id))[0].status).toBe('sent')
    })
  })

  it('连续失败达上限进入 dead；retryMail 后可重新发送', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      orderMailService.setMailProvider(() => {
        throw new Error('SMTP down')
      })
      for (let i = 0; i < 5; i++) await orderMailService.drainOutbox({ orderId: order.id, ignoreSchedule: true })
      const dead = (await orderMailService.listOrderMails(order.id))[0]
      expect(dead.status).toBe('dead')
      expect(dead.attempts).toBe(5)

      const retried = await orderMailService.retryMail(dead.id)
      expect(retried?.status).toBe('pending')
      expect(retried?.attempts).toBe(0)
      orderMailService.setMailProvider(() => undefined)
      const result = await orderMailService.drainOutbox({ orderId: order.id, ignoreSchedule: true })
      expect(result.sent).toBe(1)
      expect((await orderMailService.listOrderMails(order.id))[0].status).toBe('sent')
    })
  })

  it('未到重试时间不发送；另一租户读不到、也发不出本租户邮件', async () => {
    await inTenant(async () => {
      const order = await paidOrder()
      let calls = 0
      orderMailService.setMailProvider(() => {
        calls++
      })
      const past = await orderMailService.drainOutbox({ orderId: order.id, now: new Date(Date.now() - 60_000) })
      expect(past.scanned).toBe(0)
      expect(calls).toBe(0)

      const inOtherTenant = await inTenant2(() => orderMailService.listOrderMails(order.id))
      expect(inOtherTenant).toHaveLength(0)
      const otherDrain = await inTenant2(() => orderMailService.drainOutbox({ orderId: order.id, ignoreSchedule: true }))
      expect(otherDrain.scanned).toBe(0)
      expect(calls).toBe(0)
    })
  })
})
