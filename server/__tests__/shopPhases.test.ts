// @vitest-environment node
/**
 * 商城 阶段 2/3/4 服务层测试
 * 覆盖：合规卡点、渠道/店铺、库存防超卖、订单履约闭环、营销、数据参谋、提交发布审批流回调。
 * 依赖已迁移的测试库与租户上下文（runInTenant）。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as complianceService from '../modules/shop/services/complianceService.js'
import * as channelService from '../modules/shop/services/channelService.js'
import * as shopStoreService from '../modules/shop/services/shopStoreService.js'
import * as channelProductService from '../modules/shop/services/channelProductService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import * as orderService from '../modules/shop/services/orderService.js'
import * as marketingService from '../modules/shop/services/marketingService.js'
import * as analyticsService from '../modules/shop/services/analyticsService.js'

const TID = 1
let baseCategoryId = 0
let baseBrandId = 0

function uniq(): string {
  return `t${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    const cat = await categoryService.createCategory({ parentId: 0, name: { 'zh-CN': '测试类目' + uniq() }, level: 1, sort: 0 })
    baseCategoryId = cat.id
    const brand = await brandService.createBrand({ name: '测试品牌' + uniq() })
    baseBrandId = brand.id
  })
})

async function makeSpuWithSku(opts: { withCompliance?: boolean } = {}) {
  const spu = await spuService.createSpu({
    categoryId: baseCategoryId,
    brandId: baseBrandId,
    name: { 'zh-CN': '测试商品' + uniq() },
  })
  const sku = await skuService.createSku({
    spuId: spu.id,
    code: 'SKU' + uniq(),
    originCountry: opts.withCompliance ? 'CN' : null,
    hsCode: opts.withCompliance ? '12345678' : null,
    declaredValue: opts.withCompliance ? 10 : null,
  })
  return { spu, sku }
}

describe('阶段2：合规卡点', () => {
  it('缺失 HS/原产国/申报价值时合规校验不通过', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spu } = await makeSpuWithSku({ withCompliance: false })
      const res = await complianceService.checkSpuCompliance(spu.id)
      expect(res.ok).toBe(false)
      expect(res.missing.length).toBe(1)
      expect(res.missing[0].fields.length).toBeGreaterThan(0)
    })
  })

  it('补齐合规字段后校验通过', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spu, sku } = await makeSpuWithSku({ withCompliance: false })
      await skuService.updateSku(sku.id, { originCountry: 'CN', hsCode: '12345678', declaredValue: 10 })
      const res = await complianceService.checkSpuCompliance(spu.id)
      expect(res.ok).toBe(true)
    })
  })
})

describe('阶段2：渠道 / 店铺', () => {
  it('创建渠道与店铺，且店铺依赖渠道', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const channel = await channelService.createChannel({ name: 'Amazon' + uniq(), type: 'amazon' })
      expect(channel.id).toBeGreaterThan(0)
      const shop = await shopStoreService.createShop({ channelId: channel.id, name: 'US站' + uniq() })
      expect(shop.channelId).toBe(channel.id)
      await expect(shopStoreService.createShop({ channelId: 999999, name: 'x' })).rejects.toThrow()
      const opts = await channelService.options()
      expect(opts.find((o) => o.id === channel.id)).toBeTruthy()
    })
  })
})

describe('阶段2：提交发布 + 审批流回调', () => {
  it('合规商品可提交发布（进入 review 并创建审批流实例）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spu } = await makeSpuWithSku({ withCompliance: true })
      const res = await spuService.submitForPublish(spu.id)
      expect(['review', 'published']).toContain(res.status)
      if (res.instanceId) expect(typeof res.instanceId).toBe('number')
      const after = await spuService.getSpuById(spu.id)
      expect(after.status).toBe(res.status)
    })
  })

  it('合规缺失时提交发布被拦截', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spu } = await makeSpuWithSku({ withCompliance: false })
      await expect(spuService.submitForPublish(spu.id)).rejects.toThrow(/合规/)
    })
  })

  it('审批通过回调将 SPU 置为 published', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spu } = await makeSpuWithSku({ withCompliance: true })
      const res = await spuService.submitForPublish(spu.id)
      if (res.instanceId) {
        const updated = await spuService.applyWorkflowResult(res.instanceId, 'approved')
        expect(updated.status).toBe('published')
      } else {
        // 无审批流绑定时降级直接发布
        const updated = await spuService.getSpuById(spu.id)
        expect(updated.status).toBe('published')
      }
    })
  })

  it('审批驳回回调将 SPU 置为 rejected', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { spu } = await makeSpuWithSku({ withCompliance: true })
      const res = await spuService.submitForPublish(spu.id)
      if (res.instanceId) {
        const updated = await spuService.applyWorkflowResult(res.instanceId, 'rejected')
        expect(updated.status).toBe('rejected')
      }
    })
  })
})

describe('阶段2：发布到渠道（合规卡点）', () => {
  it('合规商品可发布到渠道，写入 channel_products(listed)', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const channel = await channelService.createChannel({ name: 'Shopify' + uniq(), type: 'shopify' })
      const shop = await shopStoreService.createShop({ channelId: channel.id, name: '自营' + uniq() })
      const { spu } = await makeSpuWithSku({ withCompliance: true })
      // 状态机：draft → review → listed → published
      await spuService.changeSpuStatus(spu.id, 'submit')
      await spuService.changeSpuStatus(spu.id, 'list')
      await spuService.changeSpuStatus(spu.id, 'publish')
      const cp = await channelProductService.publishToChannel(spu.id, channel.id, shop.id)
      expect(cp.status).toBe('listed')
      expect(cp.externalId).toBeTruthy()
    })
  })

  it('未发布商品发布到渠道被拦截', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const channel = await channelService.createChannel({ name: 'TikTok' + uniq(), type: 'tiktok' })
      const shop = await shopStoreService.createShop({ channelId: channel.id, name: '小店' + uniq() })
      const { spu } = await makeSpuWithSku({ withCompliance: true })
      await expect(channelProductService.publishToChannel(spu.id, channel.id, shop.id)).rejects.toThrow(/发布/)
    })
  })
})

describe('阶段3：库存防超卖', () => {
  it('调整库存 + 占用 + 释放 + 超卖拦截', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const wh = await warehouseService.createWarehouse({ name: '保税仓' + uniq(), type: 'bonded', country: 'CN' })
      const { sku } = await makeSpuWithSku({ withCompliance: true })
      await inventoryService.adjust(sku.id, wh.id, 100)
      expect(await inventoryService.available(sku.id)).toBe(100)
      await inventoryService.occupy(sku.id, 30, 'order-test-1')
      expect(await inventoryService.available(sku.id)).toBe(70)
      // 可用 70，占用 80 应超卖拦截
      await expect(inventoryService.occupy(sku.id, 80, 'order-test-2')).rejects.toThrow(/库存不足/)
      await inventoryService.release(sku.id, 30, 'order-test-1')
      expect(await inventoryService.available(sku.id)).toBe(100)
    })
  })

  it('按 SKU / 仓库筛选库存明细', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const wh = await warehouseService.createWarehouse({ name: '筛选仓' + uniq(), type: 'direct', country: 'CN' })
      const { sku } = await makeSpuWithSku({ withCompliance: true })
      await inventoryService.adjust(sku.id, wh.id, 42)

      const res = await inventoryService.listInventory({ skuId: sku.id, warehouseId: wh.id })
      expect(res.list.length).toBe(1)
      expect(res.list[0].quantity).toBe(42)
      expect(res.list[0].available).toBe(42)

      // 不匹配的仓库不应返回该行
      const other = await inventoryService.listInventory({ skuId: sku.id, warehouseId: wh.id + 99999 })
      expect(other.list.length).toBe(0)
    })
  })
})

describe('列表筛选参数不被丢弃', () => {
  it('SKU 全局列表支持 keyword 过滤', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { sku } = await makeSpuWithSku({ withCompliance: true })
      const res = await skuService.listSkus({ keyword: sku.code })
      expect(res.list.length).toBeGreaterThan(0)
      expect(res.list.every((s) => s.code.includes(sku.code))).toBe(true)
    })
  })

  it('渠道商品列表支持 spuId 过滤', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const channel = await channelService.createChannel({ name: '筛选渠道' + uniq(), type: 'shopify' })
      const shop = await shopStoreService.createShop({ channelId: channel.id, name: '筛选店' + uniq() })
      const { spu } = await makeSpuWithSku({ withCompliance: true })
      await spuService.changeSpuStatus(spu.id, 'submit')
      await spuService.changeSpuStatus(spu.id, 'list')
      await spuService.changeSpuStatus(spu.id, 'publish')
      await channelProductService.publishToChannel(spu.id, channel.id, shop.id)

      const res = await channelProductService.listChannelProducts({ spuId: spu.id })
      expect(res.list.length).toBe(1)
      expect(res.list[0].spuId).toBe(spu.id)
    })
  })

  it('订单列表支持 status 过滤，非法状态值被忽略', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const res = await orderService.listOrders({ status: 'not-a-real-status' })
      expect(Array.isArray(res.list)).toBe(true)
    })
  })
})

describe('阶段3：订单履约闭环', () => {
  it('建单占用 → 发货扣减并出运单号/报关号', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const channel = await channelService.createChannel({ name: '独立站' + uniq(), type: 'independent' })
      const shop = await shopStoreService.createShop({ channelId: channel.id, name: '店' + uniq() })
      const wh = await warehouseService.createWarehouse({ name: '海外仓' + uniq(), type: 'overseas', country: 'US' })
      const { sku } = await makeSpuWithSku({ withCompliance: true })
      await inventoryService.adjust(sku.id, wh.id, 50)

      const order = await orderService.createManualOrder({
        channelId: channel.id,
        shopId: shop.id,
        buyer: { country: 'US', name: 'Tom' },
        currency: 'USD',
        items: [{ skuId: sku.id, qty: 5, price: 20 }],
      })
      expect(order.status).toBe('created')
      expect(Number(order.amount)).toBe(100)
      // 占用后可用减少
      expect(await inventoryService.available(sku.id)).toBe(45)

      const shipped = await orderService.ship(order.id, { carrier: '4PX' })
      expect(shipped.status).toBe('shipped')
      // 发货后实际扣减，可用回到 45（释放占用并扣减实际）
      expect(await inventoryService.available(sku.id)).toBe(45)
      const detail = await orderService.getOrderById(order.id)
      expect(detail.shipments.length).toBe(1)
      expect(detail.shipments[0].trackingNo).toBeTruthy()
      expect(detail.shipments[0].customsNo).toContain('CN')
    })
  })

  it('未发货订单可取消并释放占用', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const channel = await channelService.createChannel({ name: '独立站B' + uniq(), type: 'independent' })
      const shop = await shopStoreService.createShop({ channelId: channel.id, name: '店B' + uniq() })
      const wh = await warehouseService.createWarehouse({ name: '海外仓B' + uniq(), type: 'overseas', country: 'US' })
      const { sku } = await makeSpuWithSku({ withCompliance: true })
      await inventoryService.adjust(sku.id, wh.id, 50)
      const order = await orderService.createManualOrder({
        channelId: channel.id,
        shopId: shop.id,
        buyer: { country: 'US' },
        currency: 'USD',
        items: [{ skuId: sku.id, qty: 5, price: 20 }],
      })
      expect(await inventoryService.available(sku.id)).toBe(45)
      const cancelled = await orderService.cancel(order.id)
      expect(cancelled.status).toBe('cancelled')
      expect(await inventoryService.available(sku.id)).toBe(50)
    })
  })
})

describe('阶段4：营销中心', () => {
  it('创建活动与优惠券（券码唯一）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const promo = await marketingService.createPromotion({
        name: { 'zh-CN': '双11' + uniq() },
        type: 'discount',
        scope: 'all',
        rule: { rate: 0.8 },
        startAt: '2026-11-01',
        endAt: '2026-11-30',
      })
      expect(promo.id).toBeGreaterThan(0)
      const code = 'CPN' + uniq()
      const coupon = await marketingService.createCoupon({ code, type: 'fixed', value: 5, currency: 'USD', validFrom: '2026-11-01', validTo: '2026-11-30', usageLimit: 0 })
      // 券码后台落库统一 trim + 大写，与 evaluateCoupon 的查询口径一致
      expect(coupon.code).toBe(code.trim().toUpperCase())
      await expect(marketingService.createCoupon({ code, type: 'fixed', value: 5, currency: 'USD', validFrom: '2026-11-01', validTo: '2026-11-30', usageLimit: 0 })).rejects.toThrow(/已存在/)
    })
  })
})

describe('阶段4：数据参谋', () => {
  // 本用例共享 TID=1 的历史订单/流水，数据随运行轮次累积；analyticsService 的
  // salesReport/profitReport 是全量聚合 + 逐单汇率快照查询，实测 7–11s 会撞上
  // vitest 默认 5s；全量并行跑时 DB/连接池争用还会把耗时推到 30s 以上，故放宽到 60s。
  // 生产报表逻辑本身无缺陷，单独复跑稳定在 13s 左右，这里只消除历轮回归噪声。
  it('销售报表能聚合订单', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const channel = await channelService.createChannel({ name: '报表渠道' + uniq(), type: 'amazon' })
      const shop = await shopStoreService.createShop({ channelId: channel.id, name: '店' + uniq() })
      const wh = await warehouseService.createWarehouse({ name: '报表仓' + uniq(), type: 'overseas', country: 'US' })
      const { sku } = await makeSpuWithSku({ withCompliance: true })
      await inventoryService.adjust(sku.id, wh.id, 100)
      const order = await orderService.createManualOrder({
        channelId: channel.id,
        shopId: shop.id,
        buyer: { country: 'US' },
        currency: 'USD',
        items: [{ skuId: sku.id, qty: 2, price: 15 }],
      })
      const sales = await analyticsService.salesReport({ dimension: 'day' })
      const total = sales.rows.reduce((s, r) => s + r.usdTotal, 0)
      expect(total).toBeGreaterThanOrEqual(30)
      const profit = await analyticsService.profitReport({})
      expect(profit.summary.revenueUSD).toBeGreaterThanOrEqual(30)
      const turnover = await analyticsService.inventoryTurnover({})
      expect(Array.isArray(turnover.rows)).toBe(true)
      void order
    })
  }, 60_000)
})
