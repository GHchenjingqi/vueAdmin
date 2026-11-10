// @vitest-environment node
/**
 * markHelpful 原子自增 + 守卫测试：
 *  - 并发 N 次投票，终态计数恰为 N（无 lost-update，单条 UPDATE 内完成校验+自增）
 *  - 未公开（pending）评价投票被守卫拦截 → 404
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopReview } from '../modules/shop/models/index.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as reviewService from '../modules/storefront/services/reviewService.js'

const TID = 1
let site: StorefrontSite

beforeAll(async () => {
  await runInTenant({ tenantId: TID }, async () => {
    site = { tenantId: TID, channelId: 0, shopId: 0, defaultCurrency: 'USD', defaultLocale: 'en-US' }
  })
})

async function makeReview(status: 'approved' | 'pending'): Promise<number> {
  const row = await ShopReview.create({
    tenantId: TID,
    spuId: 0,
    skuId: 0,
    customerId: null,
    rating: 5,
    content: 'helpful',
    status,
    helpfulCount: 0,
  } as never)
  return row.id
}

describe('markHelpful 原子自增', () => {
  it('并发 40 次投票，终态计数恰为 40（无 lost-update）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const id = await makeReview('approved')
      const N = 40
      await Promise.all(Array.from({ length: N }, () => reviewService.markHelpful(site, id)))
      const row = await ShopReview.findOne({
        where: { id, tenantId: TID },
        attributes: ['helpfulCount'],
      })
      expect(row!.helpfulCount).toBe(N)
    })
  })

  it('未公开（pending）评价投票被守卫拦截 → 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const id = await makeReview('pending')
      await expect(reviewService.markHelpful(site, id)).rejects.toMatchObject({ statusCode: 404 })
      const row = await ShopReview.findOne({ where: { id, tenantId: TID }, attributes: ['helpfulCount'] })
      expect(row!.helpfulCount).toBe(0)
    })
  })

  it('不存在的评价投票 → 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await expect(reviewService.markHelpful(site, 0)).rejects.toMatchObject({ statusCode: 404 })
    })
  })
})
