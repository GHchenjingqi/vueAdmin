// @vitest-environment node
/**
 * Storefront 退货/售后（阶段 5 步骤 5 第四切片）服务层测试
 *
 * 覆盖：
 *  - 提交退货（订单归属校验 email 匹配、可退状态校验、明细归属/数量校验、服务端重算退款金额）
 *  - 列表 / 详情（非本人 → 404）
 *  - 取消（仅 pending 可取消，其余 → 400）
 *  - 回寄（仅 approved 可提交物流单号 → returned，其余 → 400）
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { AppError } from '../middleware/errorHandler.js'
import {
  ShopChannel,
  ShopShop,
  ShopSpu,
  ShopSku,
  ShopRmaRequest,
  ShopCustomer,
  ShopOrder,
  ShopOrderItem,
} from '../modules/shop/models/index.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as rmaService from '../modules/storefront/services/rmaService.js'

const TID = 1
function uniq(): string {
  return `rma${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

let categoryId = 0
let brandId = 0
let site: StorefrontSite

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    const category = await categoryService.createCategory({
      parentId: 0,
      name: { 'en-US': 'RMA Cat ' + uniq() },
      level: 1,
      sort: 0,
    })
    categoryId = category.id
    const brand = await brandService.createBrand({ name: 'RMA Brand ' + uniq() })
    brandId = brand.id
    const channel = await ShopChannel.create({
      tenantId: TID,
      name: 'RMA Channel ' + uniq(),
      type: 'independent',
      status: 'active',
    } as never)
    const shop = await ShopShop.create({
      tenantId: TID,
      channelId: channel.id,
      name: 'RMA Shop ' + uniq(),
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

async function makeSku(): Promise<{ spuId: number; skuId: number }> {
  const spu = await spuService.createSpu({
    categoryId,
    brandId,
    name: { 'en-US': 'RMA Wig ' + uniq() },
    description: { 'en-US': 'rma test' },
  })
  const sku = await skuService.createSku({ spuId: spu.id, code: 'RMASKU' + uniq(), spec: { color: '1B' } })
  return { spuId: spu.id, skuId: sku.id }
}

/** 创建一笔订单（含 1 个明细），返回 { orderId, orderItemId } */
async function makeOrder(email: string, skuId: number, status: string, unitCents: number, qty: number) {
  const order = await ShopOrder.create({
    tenantId: TID,
    orderNo: 'ORD' + uniq(),
    channelId: site.channelId,
    shopId: site.shopId,
    buyer: { email },
    currency: 'USD',
    amount: unitCents / 100,
    status,
    email,
    amountCents: unitCents * qty,
    subtotalCents: unitCents * qty,
  } as never)
  const item = await ShopOrderItem.create({
    orderId: order.id,
    skuId,
    qty,
    price: unitCents / 100,
    tenantId: TID,
    title: 'RMA Item',
    unitAmountCents: unitCents,
    lineTotalCents: unitCents * qty,
    currency: 'USD',
  } as never)
  return { orderId: order.id, orderItemId: item.id }
}

describe('阶段5-步骤5(四)：提交退货申请', () => {
  it('登录顾客对已履约订单提交退货 → pending + 退款金额服务端重算', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { skuId } = await makeSku()
      const email = `buyer_${uniq()}@ex.com`
      const cust = await ShopCustomer.create({
        tenantId: TID,
        email,
        passwordHash: 'x',
        status: 'active',
      } as never)
      const { orderId, orderItemId } = await makeOrder(email, skuId, 'done', 5000, 2)

      const r = await rmaService.submitRma(
        site,
        { orderId, items: [{ orderItemId, skuId, qty: 1 }], reason: '不喜欢' },
        { customerId: cust.id, email },
      )
      expect(r.status).toBe('pending')
      // 退 1 件 × 5000 分
      expect(r.refundAmountCents).toBe(5000)
      expect(r.refundCurrency).toBe('USD')
      const row = await ShopRmaRequest.findOne({ where: { id: r.id, tenantId: TID } })
      expect(row!.customerId).toBe(cust.id)
      expect(row!.email).toBe(email)
    })
  })

  it('订单不存在 → 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await expect(
        rmaService.submitRma(
          site,
          { orderId: 99999999, items: [] },
          { customerId: 1, email: 'x@ex.com' },
        ),
      ).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  it('订单 email 与登录顾客不符 → 403', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { skuId } = await makeSku()
      const { orderId } = await makeOrder(`real_${uniq()}@ex.com`, skuId, 'done', 5000, 1)
      await expect(
        rmaService.submitRma(
          site,
          { orderId, items: [{ orderItemId: 1, skuId, qty: 1 }] },
          { customerId: 1, email: `other_${uniq()}@ex.com` },
        ),
      ).rejects.toMatchObject({ statusCode: 403 })
    })
  })

  it('订单状态不可退（created）→ 400', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { skuId } = await makeSku()
      const email = `buyer_${uniq()}@ex.com`
      const { orderId, orderItemId } = await makeOrder(email, skuId, 'created', 5000, 1)
      await expect(
        rmaService.submitRma(
          site,
          { orderId, items: [{ orderItemId, skuId, qty: 1 }] },
          { customerId: 1, email },
        ),
      ).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  it('退货明细不属于该订单 → 400', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const a = await makeSku()
      const b = await makeSku()
      const email = `buyer_${uniq()}@ex.com`
      const { orderId } = await makeOrder(email, a.skuId, 'done', 5000, 1)
      await expect(
        rmaService.submitRma(
          site,
          // 用 b 的 skuId 冒充 a 的订单明细
          { orderId, items: [{ orderItemId: 1, skuId: b.skuId, qty: 1 }] },
          { customerId: 1, email },
        ),
      ).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  it('退货数量超过已购数量 → 400', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { skuId } = await makeSku()
      const email = `buyer_${uniq()}@ex.com`
      const { orderId, orderItemId } = await makeOrder(email, skuId, 'done', 5000, 1)
      await expect(
        rmaService.submitRma(
          site,
          { orderId, items: [{ orderItemId, skuId, qty: 5 }] },
          { customerId: 1, email },
        ),
      ).rejects.toMatchObject({ statusCode: 400 })
    })
  })
})

describe('阶段5-步骤5(四)：列表 / 详情', () => {
  it('列表仅含本人申请；非本人详情 → 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { skuId } = await makeSku()
      const email = `buyer_${uniq()}@ex.com`
      const cust = await ShopCustomer.create({ tenantId: TID, email, passwordHash: 'x', status: 'active' } as never)
      const { orderId, orderItemId } = await makeOrder(email, skuId, 'done', 8000, 1)
      const r = await rmaService.submitRma(
        site,
        { orderId, items: [{ orderItemId, skuId, qty: 1 }] },
        { customerId: cust.id, email },
      )

      const list = await rmaService.listMyRmas(site, cust.id)
      expect(list.find((x) => x.id === r.id)).toBeTruthy()
      const detail = await rmaService.getMyRma(site, r.id, cust.id)
      expect(detail.refundAmountCents).toBe(8000)

      // 另一顾客查询 → 404
      await expect(rmaService.getMyRma(site, r.id, 999999)).rejects.toMatchObject({ statusCode: 404 })
    })
  })
})

describe('阶段5-步骤5(四)：取消 / 回寄状态机', () => {
  it('pending 可取消；非 pending 取消 → 400', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { skuId } = await makeSku()
      const email = `buyer_${uniq()}@ex.com`
      const cust = await ShopCustomer.create({ tenantId: TID, email, passwordHash: 'x', status: 'active' } as never)
      const { orderId, orderItemId } = await makeOrder(email, skuId, 'done', 5000, 1)
      const r = await rmaService.submitRma(
        site,
        { orderId, items: [{ orderItemId, skuId, qty: 1 }] },
        { customerId: cust.id, email },
      )

      const cancelled = await rmaService.cancelRma(site, r.id, cust.id)
      expect(cancelled.status).toBe('cancelled')

      await expect(rmaService.cancelRma(site, r.id, cust.id)).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  it('仅 approved 可回寄 → returned；未审核提交 → 400', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { skuId } = await makeSku()
      const email = `buyer_${uniq()}@ex.com`
      const cust = await ShopCustomer.create({ tenantId: TID, email, passwordHash: 'x', status: 'active' } as never)
      const { orderId, orderItemId } = await makeOrder(email, skuId, 'done', 5000, 1)
      const r = await rmaService.submitRma(
        site,
        { orderId, items: [{ orderItemId, skuId, qty: 1 }] },
        { customerId: cust.id, email },
      )

      // 未审核直接回寄 → 400
      await expect(
        rmaService.submitReturnTracking(site, r.id, 'SF123', cust.id),
      ).rejects.toMatchObject({ statusCode: 400 })

      // 模拟 admin 审核通过
      await ShopRmaRequest.update({ status: 'approved' }, { where: { id: r.id, tenantId: TID } } as never)
      const t = await rmaService.submitReturnTracking(site, r.id, 'SF123', cust.id)
      expect(t.status).toBe('returned')
      expect(t.trackingNo).toBe('SF123')
    })
  })
})
