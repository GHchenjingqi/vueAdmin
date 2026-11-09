// @vitest-environment node
/**
 * 商品评价 / 问答后台审核链回归
 *
 * 覆盖：pending → approved/rejected 与 pending → answered/hidden 的 CAS 迁移、
 * 并发审核互斥、重复操作幂等失败、租户隔离、后台列表过滤分页、公开侧可见性契约。
 * 独立租户 987711（跨租户对照 987712），结束清理本轮数据。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopSpu, ShopReview, ShopProductQA } from '../modules/shop/models/index.js'
import type { StorefrontSite } from '../modules/storefront/middleware/siteContext.js'
import * as storefront from '../modules/storefront/services/reviewService.js'
import * as admin from '../modules/shop/services/reviewAdminService.js'

const TID = 987711
const OTHER = 987712
const site: StorefrontSite = {
  tenantId: TID,
  channelId: 0,
  shopId: 0,
  defaultCurrency: 'USD',
  defaultLocale: 'en-US',
}

let spuId = 0
let otherSpuId = 0

const uniq = () => `rm${Date.now()}${Math.floor(Math.random() * 1e6)}`

async function inTenant<T>(fn: () => Promise<T>, tenantId = TID): Promise<T> {
  return runInTenant({ tenantId }, fn)
}

async function expectStatus(task: Promise<unknown>, statusCode: number): Promise<void> {
  try {
    await task
    expect('resolved').toBe('rejected')
  } catch (err) {
    expect((err as { statusCode?: number }).statusCode).toBe(statusCode)
  }
}

async function submitReview(rating = 5, content = 'ok ' + uniq()) {
  return storefront.submitReview(site, { spuId, rating, content })
}

async function submitQuestion(question = 'q ' + uniq()) {
  return storefront.submitQuestion(site, { spuId, question })
}

beforeAll(async () => {
  await inTenant(async () => {
    const spu = await ShopSpu.create({
      tenantId: TID,
      categoryId: 0,
      brandId: null,
      name: { 'en-US': 'Moderation SPU' },
      status: 'published',
    } as never)
    spuId = spu.id
  })
  await inTenant(async () => {
    const spu = await ShopSpu.create({
      tenantId: OTHER,
      categoryId: 0,
      brandId: null,
      name: { 'en-US': 'Other tenant SPU' },
      status: 'published',
    } as never)
    otherSpuId = spu.id
  }, OTHER)
})

afterAll(async () => {
  await ShopReview.destroy({ where: { tenantId: TID } })
  await ShopProductQA.destroy({ where: { tenantId: TID } })
  await ShopSpu.destroy({ where: { tenantId: TID } })
  await ShopSpu.destroy({ where: { tenantId: OTHER } })
})

describe('评价审核链', () => {
  it('pending 评价公开不可见，但后台列表可查到', async () => {
    await inTenant(async () => {
      const { id, status } = await submitReview()
      expect(status).toBe('pending')
      const pub = await storefront.listReviews(site, { spuId })
      expect(pub.items.some((i) => i.id === id)).toBe(false)
      const mod = await admin.listReviews({ status: 'pending' })
      expect(mod.rows.some((r) => r.id === id)).toBe(true)
    })
  })

  it('审核通过后公开可见，评分汇总计入', async () => {
    await inTenant(async () => {
      const { id } = await submitReview(4)
      const row = await admin.approveReview(id)
      expect(row?.status).toBe('approved')
      const pub = await storefront.listReviews(site, { spuId })
      expect(pub.items.find((i) => i.id === id)?.rating).toBe(4)
      expect(pub.summary.distribution[4]).toBeGreaterThanOrEqual(1)
    })
  })

  it('重复审核通过 / 审核已终态评价 → 400', async () => {
    await inTenant(async () => {
      const { id } = await submitReview()
      await admin.approveReview(id)
      await expectStatus(admin.approveReview(id), 400)
      await expectStatus(admin.rejectReview(id), 400)
    })
  })

  it('驳回 pending 后公开仍不可见', async () => {
    await inTenant(async () => {
      const { id } = await submitReview()
      const row = await admin.rejectReview(id)
      expect(row?.status).toBe('rejected')
      const pub = await storefront.listReviews(site, { spuId })
      expect(pub.items.some((i) => i.id === id)).toBe(false)
    })
  })

  it('并发 approve / reject 恰好一方胜出，终态与胜者一致', async () => {
    await inTenant(async () => {
      const { id } = await submitReview()
      const settled = await Promise.allSettled([admin.approveReview(id), admin.rejectReview(id)])
      const wins = settled.filter((s) => s.status === 'fulfilled')
      const loses = settled.filter((s) => s.status === 'rejected')
      expect(wins).toHaveLength(1)
      expect(loses).toHaveLength(1)
      expect((loses[0] as PromiseRejectedResult).reason.statusCode).toBe(400)
      const winnerApproved = (wins[0] as PromiseFulfilledResult<{ status: string } | null>).value?.status === 'approved'
      const final = await ShopReview.findByPk(id)
      expect(final?.status).toBe(winnerApproved ? 'approved' : 'rejected')
      const pub = await storefront.listReviews(site, { spuId })
      expect(pub.items.some((i) => i.id === id)).toBe(winnerApproved)
    })
  })

  it('不存在与跨租户审核 → 404', async () => {
    await inTenant(async () => {
      await expectStatus(admin.approveReview(99999999), 404)
      const { id } = await submitReview()
      await inTenant(async () => {
        await expectStatus(admin.approveReview(id), 404)
      }, OTHER)
    })
  })

  it('后台列表按 status / spuId 过滤并分页', async () => {
    await inTenant(async () => {
      await submitReview()
      const pending = await admin.listReviews({ status: 'pending', spuId, limit: 2, offset: 0 })
      expect(pending.limit).toBe(2)
      expect(pending.rows.every((r) => r.status === 'pending' && r.spuId === spuId)).toBe(true)
      expect(pending.rows.length).toBeLessThanOrEqual(2)
      expect(pending.total).toBeGreaterThanOrEqual(pending.rows.length)
      const empty = await admin.listReviews({ spuId: otherSpuId })
      expect(empty.total).toBe(0)
    })
  })

  it('非法状态过滤 → 400', async () => {
    await inTenant(async () => {
      await expectStatus(admin.listReviews({ status: 'bogus' }), 400)
      await expectStatus(admin.listQuestions({ status: 'bogus' }), 400)
    })
  })
})

describe('问答审核链', () => {
  it('pending 问答公开不可见', async () => {
    await inTenant(async () => {
      const { id } = await submitQuestion()
      const pub = await storefront.listQuestions(site, { spuId })
      expect(pub.some((q) => q.id === id)).toBe(false)
      expect((await admin.listQuestions({ status: 'pending' })).rows.some((q) => q.id === id)).toBe(true)
    })
  })

  it('回答后公开可见，答案 / 时间 / 回答者一并固化', async () => {
    await inTenant(async () => {
      const { id } = await submitQuestion()
      const row = await admin.answerQuestion(id, '官方答复 ' + uniq(), 'reviewer-a')
      expect(row?.status).toBe('answered')
      expect(row?.answeredBy).toBe('reviewer-a')
      expect(row?.answeredAt).toBeTruthy()
      const pub = await storefront.listQuestions(site, { spuId })
      expect(pub.find((q) => q.id === id)?.answer).toContain('官方答复')
    })
  })

  it('重复回答 → 400 且原答案不被覆盖', async () => {
    await inTenant(async () => {
      const { id } = await submitQuestion()
      await admin.answerQuestion(id, 'first answer', 'reviewer-a')
      await expectStatus(admin.answerQuestion(id, 'overwritten', 'reviewer-b'), 400)
      const final = await ShopProductQA.findByPk(id)
      expect(final?.answer).toBe('first answer')
      expect(final?.answeredBy).toBe('reviewer-a')
    })
  })

  it('隐藏 answered 后公开不可见', async () => {
    await inTenant(async () => {
      const { id } = await submitQuestion()
      await admin.answerQuestion(id, 'visible answer', 'reviewer-a')
      const row = await admin.hideQuestion(id)
      expect(row?.status).toBe('hidden')
      const pub = await storefront.listQuestions(site, { spuId })
      expect(pub.some((q) => q.id === id)).toBe(false)
    })
  })

  it('并发 answer / answer 严格一方胜出，答案不被后写覆盖', async () => {
    await inTenant(async () => {
      const { id } = await submitQuestion()
      const settled = await Promise.allSettled([admin.answerQuestion(id, 'answer-A', 'reviewer-a'), admin.answerQuestion(id, 'answer-B', 'reviewer-b')])
      expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1)
      expect((settled.find((s) => s.status === 'rejected') as PromiseRejectedResult).reason.statusCode).toBe(400)
      const final = await ShopProductQA.findByPk(id)
      expect(['answer-A', 'answer-B']).toContain(final?.answer)
      expect(final?.status).toBe('answered')
    })
  })

  it('并发 answer / hide 终态与公开可见性始终一致', async () => {
    await inTenant(async () => {
      const { id } = await submitQuestion()
      // hide 允许从 answered 出发（下架已回答内容），故两者可能串行都成功；
      // 关键契约是：终态与公开可见性一致，且不会出现状态回退或半写入答案。
      await Promise.allSettled([admin.answerQuestion(id, 'concurrent answer', 'reviewer-a'), admin.hideQuestion(id)])
      const final = await ShopProductQA.findByPk(id)
      expect(['answered', 'hidden']).toContain(final?.status)
      const pub = await storefront.listQuestions(site, { spuId })
      const visible = pub.some((q) => q.id === id)
      expect(visible).toBe(final?.status === 'answered')
      if (visible) expect(final?.answer).toBe('concurrent answer')
    })
  })

  it('重复隐藏 / 隐藏已隐藏 → 400', async () => {
    await inTenant(async () => {
      const { id } = await submitQuestion()
      await admin.hideQuestion(id)
      await expectStatus(admin.hideQuestion(id), 400)
      await expectStatus(admin.answerQuestion(id, 'late answer', 'reviewer-a'), 400)
    })
  })

  it('「有用」投票仅对 approved 评价开放（既有契约不回退）', async () => {
    await inTenant(async () => {
      const pending = await submitReview()
      await expectStatus(storefront.markHelpful(site, pending.id), 404)
      const approved = await submitReview()
      await admin.approveReview(approved.id)
      expect((await storefront.markHelpful(site, approved.id)).helpfulCount).toBe(1)
    })
  })
})
