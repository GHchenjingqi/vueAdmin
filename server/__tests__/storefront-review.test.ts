// @vitest-environment node
/**
 * Storefront 商品评价 + 问答（阶段 5 步骤 5 第二切片）服务层测试
 *
 * 覆盖：
 *  - 评价提交（游客/登录、SPU 不存在 404、SKU 不属于 SPU 404、评分越界 400）
 *  - 评价列表（仅 approved 可见 + 评分汇总；pending 不计入）
 *  - 「有用」自增（仅 approved；不存在/未公开 404）
 *  - 问答提交（pending）与列表（仅 answered）
 *  - 已购验证（登录顾客 email 匹配已支付订单含该 SKU → verified；email 不符/未支付 → false）
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { Op } from 'sequelize'
import { runInTenant } from '../modules/tenant/context.js'
import { AppError } from '../middleware/errorHandler.js'
import {
  ShopChannel,
  ShopShop,
  ShopSpu,
  ShopSku,
  ShopReview,
  ShopProductQA,
  ShopCustomer,
  ShopOrder,
  ShopOrderItem,
} from '../modules/shop/models/index.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as reviewService from '../modules/storefront/services/reviewService.js'

const TID = 1
function uniq(): string {
  return `rv${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

let categoryId = 0
let brandId = 0
let site: StorefrontSite

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    const category = await categoryService.createCategory({
      parentId: 0,
      name: { 'en-US': 'RV Cat ' + uniq() },
      level: 1,
      sort: 0,
    })
    categoryId = category.id
    const brand = await brandService.createBrand({ name: 'RV Brand ' + uniq() })
    brandId = brand.id
    const channel = await ShopChannel.create({
      tenantId: TID,
      name: 'RV Channel ' + uniq(),
      type: 'independent',
      status: 'active',
    } as never)
    const shop = await ShopShop.create({
      tenantId: TID,
      channelId: channel.id,
      name: 'RV Shop ' + uniq(),
      credentials: { defaultCurrency: 'USD', defaultLocale: 'en-US' },
    } as never)
    site = {
      tenantId: TID,
      channelId: channel.id,
      shopId: shop.id,
      defaultCurrency: 'USD',
      defaultLocale: 'en-US',
    }
  })
})

async function makeSpu(): Promise<{ spuId: number; skuId: number }> {
  const spu = await spuService.createSpu({
    categoryId,
    brandId,
    name: { 'en-US': 'RV Wig ' + uniq() },
    description: { 'en-US': 'review test' },
  })
  const sku = await skuService.createSku({ spuId: spu.id, code: 'RVSKU' + uniq(), spec: { color: '1B' } })
  return { spuId: spu.id, skuId: sku.id }
}

describe('阶段5-步骤5(二)：商品评价提交', () => {
  it('游客提交评价 → pending + 返回 id', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spuId, skuId } = await makeSpu()
      const r = await reviewService.submitReview(site, {
        spuId,
        skuId,
        rating: 5,
        content: '很好用',
      })
      expect(r.status).toBe('pending')
      expect(r.id).toBeGreaterThan(0)
      const row = await ShopReview.findOne({ where: { id: r.id, tenantId: TID } })
      expect(row).toBeTruthy()
      expect(row!.customerId).toBeNull()
      expect(row!.verified).toBe(false)
    })
  })

  it('评价不存在的 SPU → 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await expect(
        reviewService.submitReview(site, { spuId: 99999999, rating: 5, content: 'x' }),
      ).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  it('SKU 不属于该 SPU → 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const a = await makeSpu()
      const b = await makeSpu()
      await expect(
        reviewService.submitReview(site, { spuId: a.spuId, skuId: b.skuId, rating: 4, content: 'x' }),
      ).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  it('评分越界(0 / 6) → 400', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spuId } = await makeSpu()
      await expect(
        reviewService.submitReview(site, { spuId, rating: 0, content: 'x' }),
      ).rejects.toMatchObject({ statusCode: 400 })
      await expect(
        reviewService.submitReview(site, { spuId, rating: 6, content: 'x' }),
      ).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  it('匿名提交 → isAnonymous=true 且 reviewerName 折叠为「匿名用户」', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spuId } = await makeSpu()
      const r = await reviewService.submitReview(site, { spuId, rating: 4, content: '匿名好评', isAnonymous: true })
      const approved = await ShopReview.findOne({ where: { id: r.id, tenantId: TID } })
      await approved!.update({ status: 'approved' })
      const list = await reviewService.listReviews(site, { spuId })
      const item = list.items.find((i) => i.id === r.id)!
      expect(item.isAnonymous).toBe(true)
      expect(item.reviewerName).toBe('匿名用户')
    })
  })
})

describe('阶段5-步骤5(二)：评价列表与汇总', () => {
  it('列表仅含 approved，汇总（平均/分布）正确', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spuId } = await makeSpu()
      const r1 = await reviewService.submitReview(site, { spuId, rating: 5, content: 'a' })
      const r2 = await reviewService.submitReview(site, { spuId, rating: 5, content: 'b' })
      const r3 = await reviewService.submitReview(site, { spuId, rating: 3, content: 'c' })
      await ShopReview.update(
        { status: 'approved' },
        { where: { id: { [Op.in]: [r1.id, r2.id, r3.id] } } } as never,
      )

      const list = await reviewService.listReviews(site, { spuId })
      expect(list.summary.total).toBe(3)
      // 平均 (5+5+3)/3 = 4.33...
      expect(list.summary.average).toBeCloseTo(13 / 3, 2)
      expect(list.summary.distribution[5]).toBe(2)
      expect(list.summary.distribution[3]).toBe(1)
      expect(list.items).toHaveLength(3)
    })
  })

  it('pending 评价不计入列表与汇总', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spuId } = await makeSpu()
      await reviewService.submitReview(site, { spuId, rating: 5, content: 'approved only' })
      const pending = await reviewService.submitReview(site, { spuId, rating: 2, content: 'pending only' })
      // 仅批准第一条
      const approved = await ShopReview.findOne({ where: { spuId, tenantId: TID, content: 'approved only' } })
      await approved!.update({ status: 'approved' })

      const list = await reviewService.listReviews(site, { spuId })
      expect(list.summary.total).toBe(1)
      expect(list.items.find((i) => i.id === pending.id)).toBeFalsy()
    })
  })
})

describe('阶段5-步骤5(二)：标记有用', () => {
  it('markHelpful 自增计数', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spuId } = await makeSpu()
      const r = await reviewService.submitReview(site, { spuId, rating: 4, content: 'helpful target' })
      await ShopReview.update({ status: 'approved' }, { where: { id: r.id, tenantId: TID } } as never)
      const first = await reviewService.markHelpful(site, r.id)
      expect(first.helpfulCount).toBe(1)
      const second = await reviewService.markHelpful(site, r.id)
      expect(second.helpfulCount).toBe(2)
    })
  })

  it('对不存在/未公开评价 markHelpful → 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await expect(reviewService.markHelpful(site, 99999999)).rejects.toMatchObject({ statusCode: 404 })
    })
  })
})

describe('阶段5-步骤5(二)：问答', () => {
  it('提交问题 → pending', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spuId, skuId } = await makeSpu()
      const r = await reviewService.submitQuestion(site, { spuId, skuId, question: '有货吗？' })
      expect(r.status).toBe('pending')
      const row = await ShopProductQA.findOne({ where: { id: r.id, tenantId: TID } })
      expect(row).toBeTruthy()
      expect(row!.answer).toBeNull()
    })
  })

  it('列表仅含 answered', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spuId } = await makeSpu()
      const q1 = await reviewService.submitQuestion(site, { spuId, question: '已回答的问题' })
      const q2 = await reviewService.submitQuestion(site, { spuId, question: '待回答的问题' })
      // 仅回答第一条
      await ShopProductQA.update(
        { status: 'answered', answer: '3-5 个工作日发货', answeredAt: new Date() },
        { where: { id: q1.id, tenantId: TID } } as never,
      )
      const list = await reviewService.listQuestions(site, { spuId })
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe(q1.id)
      expect(list[0].answer).toBe('3-5 个工作日发货')
      expect(list.find((q) => q.id === q2.id)).toBeFalsy()
    })
  })
})

describe('阶段5-步骤5(二)：已购验证', () => {
  async function makePaidOrder(email: string, skuId: number, status: string) {
    const order = await ShopOrder.create({
      tenantId: TID,
      orderNo: 'ORD' + uniq(),
      channelId: site.channelId,
      shopId: site.shopId,
      buyer: { email },
      currency: 'USD',
      amount: 99,
      status,
      email,
      amountCents: 9900,
      subtotalCents: 9900,
    } as never)
    await ShopOrderItem.create({
      orderId: order.id,
      skuId,
      qty: 1,
      price: 99,
      tenantId: TID,
      unitAmountCents: 9900,
      lineTotalCents: 9900,
      currency: 'USD',
    } as never)
    return order.id
  }

  it('登录顾客 email 匹配已支付订单含该 SKU → verified=true', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spuId, skuId } = await makeSpu()
      const email = `buyer_${uniq()}@ex.com`
      const cust = await ShopCustomer.create({
        tenantId: TID,
        email,
        passwordHash: 'x',
        status: 'active',
      } as never)
      const orderId = await makePaidOrder(email, skuId, 'paid')
      const r = await reviewService.submitReview(
        site,
        { spuId, skuId, rating: 5, content: '已购买好评', orderId },
        { customerId: cust.id, email },
      )
      const row = await ShopReview.findOne({ where: { id: r.id, tenantId: TID } })
      expect(row!.verified).toBe(true)
      expect(row!.customerId).toBe(cust.id)
    })
  })

  it('订单 email 与登录顾客不符 → verified=false', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spuId, skuId } = await makeSpu()
      const buyerEmail = `buyer_${uniq()}@ex.com`
      const orderId = await makePaidOrder(`other_${uniq()}@ex.com`, skuId, 'paid')
      const r = await reviewService.submitReview(
        site,
        { spuId, skuId, rating: 4, content: 'x', orderId },
        { customerId: 1, email: buyerEmail },
      )
      const row = await ShopReview.findOne({ where: { id: r.id, tenantId: TID } })
      expect(row!.verified).toBe(false)
    })
  })

  it('订单未支付（created）→ verified=false', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spuId, skuId } = await makeSpu()
      const email = `buyer_${uniq()}@ex.com`
      const orderId = await makePaidOrder(email, skuId, 'created')
      const r = await reviewService.submitReview(
        site,
        { spuId, skuId, rating: 4, content: 'x', orderId },
        { customerId: 1, email },
      )
      const row = await ShopReview.findOne({ where: { id: r.id, tenantId: TID } })
      expect(row!.verified).toBe(false)
    })
  })
})
