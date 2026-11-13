import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Op } from 'sequelize'

// 仅 mock ShopArticle 模型，验证 listFaqs 输出边界对 FAQ 富文本答案的净化
vi.mock('../modules/shop/models/index.js', () => ({
  ShopArticle: { findAll: vi.fn(), findOne: vi.fn() },
}))

import { ShopArticle } from '../modules/shop/models/index.js'
import { listFaqs, getFaqBySlug } from '../modules/storefront/services/cmsService.js'

const SITE = { tenantId: 1, shopId: 0 } as any

const MALICIOUS =
  '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(2)>' +
  '<a href="javascript:alert(3)">x</a><b>bold</b>'

describe('P3: FAQ 答案存储型 XSS 净化（公开接口输出边界）', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listFaqs 返回的答案已剥离 script / 事件属性 / javascript: 协议', async () => {
    ;(ShopArticle.findAll as any).mockResolvedValue([
      {
        id: 1,
        title: '如何退货',
        slug: 'return',
        summary: null,
        tags: ['faq'],
        sortOrder: 1,
        updatedAt: new Date(),
        content: MALICIOUS,
      },
    ])

    const { items } = await listFaqs(SITE, {})
    const answer = items[0].answer

    expect(answer).toContain('<p>ok</p>')
    expect(answer).toContain('<b>bold</b>')
    expect(answer).not.toContain('<script')
    expect(answer).not.toMatch(/onerror/i)
    expect(answer).not.toMatch(/javascript:/i)
  })

  it('getFaqBySlug 返回的答案同样被净化', async () => {
    ;(ShopArticle.findOne as any).mockResolvedValue({
      id: 1,
      title: '如何退货',
      slug: 'return',
      summary: null,
      tags: ['faq'],
      sortOrder: 1,
      updatedAt: new Date(),
      content: MALICIOUS,
    })

    const item = await getFaqBySlug(SITE, 'return')
    const answer = item.answer

    expect(answer).not.toContain('<script')
    expect(answer).not.toMatch(/onerror/i)
    expect(answer).not.toMatch(/javascript:/i)
    expect(answer).toContain('<p>ok</p>')
  })

  it('空内容安全返回空串', async () => {
    ;(ShopArticle.findAll as any).mockResolvedValue([
      { id: 2, title: 'Q', slug: 'q2', summary: null, tags: ['faq'], sortOrder: 2, updatedAt: new Date(), content: null },
    ])
    const { items } = await listFaqs(SITE, {})
    expect(items[0].answer).toBe('')
  })
})
