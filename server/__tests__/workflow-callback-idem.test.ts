// @vitest-environment node
/**
 * 工作流审批回调幂等实证（spuService.applyWorkflowResult）
 *
 * 缺陷背景（2026-11-09 静态坐实 + 写库复现）：审批结果回调是免鉴权内部接口，
 * 但 applyWorkflowResult 只校验实例 bindingKey，随后无条件
 * `spu.update({status})` 并执行 SKU 跟随 / 渠道推送：
 * - 同一实例回调重放（引擎重试、HTTP 重放）会重复生成渠道 externalId；
 * - approved 后的 rejected 回调把已发布商品打回 rejected，且不联动 SKU，
 *   SPU/SKU 状态永久分裂；
 * - 任何非待审状态（draft/published/archived）都能被直接改写。
 *
 * 修复：以 SPU 状态 CAS（review → 目标态）作为唯一认领闸门，重复结果幂等返回、
 * 不一致结果 409，只有 CAS 胜出者执行不可逆副作用。
 * 独立租户 987710，直建工作流实例夹具（不启动引擎异步回调）。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as channelService from '../modules/shop/services/channelService.js'
import * as shopStoreService from '../modules/shop/services/shopStoreService.js'
import { ShopSpu, ShopSku, ShopChannelProduct } from '../modules/shop/models/index.js'
import WorkflowInstance from '../models/WorkflowInstance.js'
import type { SpuStatus } from '../shared/schemas/shop.js'

const TID = 987710
const uniq = (): string => `wi${Date.now()}${Math.floor(Math.random() * 1e6)}`
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

let categoryId = 0
let brandId = 0
let channelId = 0
let shopId = 0

beforeAll(async () => {
  await inTenant(async () => {
    const cat = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'WI Cat ' + uniq() }, level: 1, sort: 0 })
    const brand = await brandService.createBrand({ name: 'WI Brand ' + uniq() })
    const channel = await channelService.createChannel({ name: 'WI Channel ' + uniq(), type: 'shopify' })
    const shop = await shopStoreService.createShop({ channelId: channel.id, name: 'WI Shop ' + uniq() })
    categoryId = cat.id
    brandId = brand.id
    channelId = channel.id
    shopId = shop.id
  })
})

beforeEach(async () => {
  await inTenant(async () => {
    await ShopChannelProduct.destroy({ where: { tenantId: TID } })
    await WorkflowInstance.destroy({ where: { tenantId: TID } })
  })
})

/** 建一个待审 SPU + 合规 SKU + 直建工作流实例（input 携带渠道发布意图） */
async function seed(withChannel = false, startStatus: SpuStatus = 'review') {
  const spu = await spuService.createSpu({ categoryId, brandId, name: { 'en-US': 'WI SPU ' + uniq() } })
  const sku = await skuService.createSku({
    spuId: spu.id,
    code: 'WI' + uniq(),
    originCountry: 'CN',
    hsCode: '12345678',
    declaredValue: 10,
  })
  if (startStatus === 'review') await spuService.changeSpuStatus(spu.id, 'submit')
  else if (startStatus !== 'draft') await ShopSpu.update({ status: startStatus }, { where: { id: spu.id, tenantId: TID } })
  const instance = await WorkflowInstance.create({
    workflowId: 0,
    versionId: 0,
    bindingKey: 'shop-publish',
    bindingId: spu.id,
    title: 'workflow callback idem fixture',
    status: 'pending',
    input: JSON.stringify({ spuId: spu.id, channelId, shopId, listToChannel: withChannel }),
    startedBy: 0,
    tenantId: TID,
  } as never)
  return { spuId: spu.id, skuId: sku.id, instanceId: instance.id }
}

async function snapshot(spuId: number, skuId: number) {
  const [spu, sku, channelRows] = await Promise.all([
    ShopSpu.findByPk(spuId),
    ShopSku.findByPk(skuId),
    ShopChannelProduct.findAll({ where: { tenantId: TID, spuId } }),
  ])
  return {
    spuStatus: spu?.status,
    skuStatus: sku?.status,
    channelRows: channelRows.length,
    externalId: channelRows[0]?.externalId ?? null,
  }
}

describe('审批回调幂等与终态一致性', () => {
  it('首次 approved：SPU/SKU 发布，渠道商品只建一行', async () => {
    await inTenant(async () => {
      const { spuId, skuId, instanceId } = await seed(true)
      const res = await spuService.applyWorkflowResult(instanceId, 'approved')
      expect(res.status).toBe('published')
      expect(await snapshot(spuId, skuId)).toMatchObject({
        spuStatus: 'published',
        skuStatus: 'published',
        channelRows: 1,
      })
    })
  })

  it('顺序重放 approved：幂等返回，渠道 externalId 不被重新推送覆盖', async () => {
    await inTenant(async () => {
      const { spuId, skuId, instanceId } = await seed(true)
      await spuService.applyWorkflowResult(instanceId, 'approved')
      const first = await snapshot(spuId, skuId)
      expect(first.externalId).toBeTruthy()

      const replay = await spuService.applyWorkflowResult(instanceId, 'approved')
      expect(replay.status).toBe('published')
      const after = await snapshot(spuId, skuId)
      expect(after).toEqual(first)
    })
  })

  it('并发两次 approved：都成功（幂等），渠道只推一次、只一行', async () => {
    await inTenant(async () => {
      const { spuId, skuId, instanceId } = await seed(true)
      const rs = await Promise.allSettled([spuService.applyWorkflowResult(instanceId, 'approved'), spuService.applyWorkflowResult(instanceId, 'approved')])
      expect(rs.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled'])
      const s = await snapshot(spuId, skuId)
      expect(s).toMatchObject({ spuStatus: 'published', skuStatus: 'published', channelRows: 1 })
      expect(s.externalId).toBeTruthy()
    })
  })

  it('approved 后的 rejected 回调被拒：SPU/SKU 保持 published，不出现状态分裂', async () => {
    await inTenant(async () => {
      const { spuId, skuId, instanceId } = await seed()
      await spuService.applyWorkflowResult(instanceId, 'approved')
      await expect(spuService.applyWorkflowResult(instanceId, 'rejected', 'late reject')).rejects.toThrow(/不接受审批结果 rejected/)
      expect(await snapshot(spuId, skuId)).toMatchObject({ spuStatus: 'published', skuStatus: 'published' })
    })
  })

  it('rejected 后的 approved 回调被拒：终态不被改回 published', async () => {
    await inTenant(async () => {
      const { spuId, skuId, instanceId } = await seed()
      await expect(spuService.applyWorkflowResult(instanceId, 'rejected', 'not qualified')).resolves.toMatchObject({ status: 'rejected' })
      await expect(spuService.applyWorkflowResult(instanceId, 'approved')).rejects.toThrow(/不接受审批结果 published/)
      expect(await snapshot(spuId, skuId)).toMatchObject({ spuStatus: 'rejected' })
    })
  })

  it('非 review 状态（draft）回调一律 409，不改写状态', async () => {
    await inTenant(async () => {
      const { spuId, skuId, instanceId } = await seed(false, 'draft')
      await expect(spuService.applyWorkflowResult(instanceId, 'approved')).rejects.toThrow(/不接受审批结果 published/)
      expect(await snapshot(spuId, skuId)).toMatchObject({ spuStatus: 'draft' })
    })
  })
})

describe('既有契约不回退', () => {
  it('无效 / 非 shop-publish 实例仍返回 400', async () => {
    await inTenant(async () => {
      await expect(spuService.applyWorkflowResult(99999999, 'approved')).rejects.toThrow(/无效的工作流实例/)
    })
  })

  it('首次 rejected 正常置 rejected，且不联动发布 SKU', async () => {
    await inTenant(async () => {
      const { spuId, skuId, instanceId } = await seed()
      await expect(spuService.applyWorkflowResult(instanceId, 'rejected', 'not qualified')).resolves.toMatchObject({ status: 'rejected' })
      expect(await snapshot(spuId, skuId)).toMatchObject({ spuStatus: 'rejected', channelRows: 0 })
    })
  })
})
