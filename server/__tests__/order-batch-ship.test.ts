// @vitest-environment node
/**
 * 批量发货（PLAN 4.1）
 *
 * 缺口：`orderService.ship(id, input)` 一次只处理一个订单，后台发货弹窗也只能单条提交。
 * 跨境日出百单时，运营需要逐单复制运单号。
 *
 * 本测试锁定批量语义的四条硬约束：
 * 1. 单条失败不阻断其余（部分成功是常态，不是异常）；
 * 2. 失败原因逐单返回，便于直接定位重试；
 * 3. 同一单在一次请求内重复出现只处理一次（否则第二条会因"已发货"伪失败）；
 * 4. 缺少承运商的行明确失败，不静默用店铺名兜底。
 *
 * 独立租户 987780，真实 MySQL。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import * as orderService from '../modules/shop/services/orderService.js'
import { ShopOrder, ShopOrderShipment, ShopChannel, ShopShop } from '../modules/shop/models/index.js'

const TID = 987780
const uniq = (): string => `bat${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

let skuId = 0
let channelId = 0
let shopId = 0

/** 建一张 paid 订单（ship 只接受 created/paid/fulfilled） */
async function makePaidOrder(): Promise<number> {
  const order = await orderService.createManualOrder({
    channelId,
    shopId,
    buyer: { name: 'Batch Buyer', email: 'batch@example.com' },
    currency: 'USD',
    items: [{ skuId, qty: 1, price: 100 }],
  })
  await orderService.markPaid(order.id)
  return order.id
}

beforeAll(async () => {
  await inTenant(async () => {
    const category = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'BAT Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'BAT Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'BAT WH ' + uniq(), type: 'overseas', country: 'US' })
    const spu = await spuService.createSpu({
      categoryId: category.id,
      brandId: brand.id,
      name: { 'en-US': 'BAT Wig ' + uniq(), 'zh-CN': '批量发货测试商品' },
      description: { 'en-US': 'batch ship fixture' },
    })
    const sku = await skuService.createSku({ spuId: spu.id, code: 'BATSKU' + uniq(), spec: { color: '1B' } })
    skuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 100 })
    await inventoryService.adjust(sku.id, warehouse.id, 500)

    const channel = await ShopChannel.create({ name: 'BAT Ch ' + uniq(), type: 'independent', tenantId: TID } as never)
    channelId = channel.id
    const shop = await ShopShop.create({ name: 'BAT Shop ' + uniq(), channelId, tenantId: TID } as never)
    shopId = shop.id
  })
}, 60_000)

afterAll(async () => {
  await inTenant(async () => {
    const orders = await ShopOrder.findAll({ where: { tenantId: TID }, attributes: ['id'] })
    const ids = orders.map((o) => o.id)
    if (ids.length) {
      await ShopOrderShipment.destroy({ where: { tenantId: TID } })
      await ShopOrder.destroy({ where: { tenantId: TID } })
    }
    await ShopShop.destroy({ where: { tenantId: TID } })
    await ShopChannel.destroy({ where: { tenantId: TID } })
  })
})

describe('batchShip', () => {
  it('ships several orders in one call and reports per-order results', async () => {
    await inTenant(async () => {
      const a = await makePaidOrder()
      const b = await makePaidOrder()
      const res = await orderService.batchShip(
        [
          { orderId: a, carrier: 'YunExpress', trackingNo: 'YT0001' },
          { orderId: b, carrier: 'YunExpress', trackingNo: 'YT0002' },
        ],
        undefined,
      )
      expect(res.total).toBe(2)
      expect(res.succeeded).toBe(2)
      expect(res.failed).toBe(0)
      expect(res.rows.every((r) => r.ok && r.status === 'shipped')).toBe(true)
      expect(res.rows.map((r) => r.trackingNo)).toEqual(['YT0001', 'YT0002'])

      const shipped = await ShopOrder.findAll({ where: { tenantId: TID, id: [a, b] } })
      expect(shipped.every((o) => o.status === 'shipped')).toBe(true)
    })
  }, 60_000)

  it('continues after a single failure and reports the reason for that order', async () => {
    await inTenant(async () => {
      const ok = await makePaidOrder()
      const missing = 999999999
      const res = await orderService.batchShip(
        [
          { orderId: missing, carrier: 'YunExpress', trackingNo: 'YT9999' },
          { orderId: ok, carrier: 'YunExpress', trackingNo: 'YT0003' },
        ],
        undefined,
      )
      expect(res.total).toBe(2)
      expect(res.succeeded).toBe(1)
      expect(res.failed).toBe(1)
      const failedRow = res.rows.find((r) => !r.ok)
      expect(failedRow?.orderId).toBe(missing)
      expect(failedRow?.error).toMatch(/不存在/)
      // 失败不影响同一批里的成功单
      const shipped = await ShopOrder.findOne({ where: { tenantId: TID, id: ok } })
      expect(shipped?.status).toBe('shipped')
    })
  }, 60_000)

  it('deduplicates repeated order ids instead of failing the second occurrence', async () => {
    await inTenant(async () => {
      const id = await makePaidOrder()
      const res = await orderService.batchShip(
        [
          { orderId: id, carrier: 'YunExpress', trackingNo: 'YT0004' },
          { orderId: id, carrier: 'YunExpress', trackingNo: 'YT0005' },
        ],
        undefined,
      )
      expect(res.total).toBe(1)
      expect(res.succeeded).toBe(1)
      expect(res.failed).toBe(0)
    })
  }, 60_000)

  it('fails rows without a carrier rather than guessing one', async () => {
    await inTenant(async () => {
      const id = await makePaidOrder()
      const res = await orderService.batchShip([{ orderId: id, trackingNo: 'YT0006' }], undefined)
      expect(res.failed).toBe(1)
      expect(res.rows[0].error).toMatch(/缺少承运商/)
      const untouched = await ShopOrder.findOne({ where: { tenantId: TID, id } })
      expect(untouched?.status).toBe('paid')
    })
  }, 60_000)

  it('uses defaultCarrier when a row omits its own carrier', async () => {
    await inTenant(async () => {
      const id = await makePaidOrder()
      const res = await orderService.batchShip([{ orderId: id, trackingNo: 'YT0007' }], '4PX')
      expect(res.succeeded).toBe(1)
      expect(res.rows[0].carrier).toBe('4PX')
    })
  }, 60_000)

  it('rejects an empty batch and an oversized batch', async () => {
    await inTenant(async () => {
      await expect(orderService.batchShip([], undefined)).rejects.toThrow(/至少提供一条/)
      const tooMany = Array.from({ length: 101 }, (_, i) => ({ orderId: i + 1 }))
      await expect(orderService.batchShip(tooMany, 'X')).rejects.toThrow(/最多 100 条/)
    })
  }, 60_000)
})
