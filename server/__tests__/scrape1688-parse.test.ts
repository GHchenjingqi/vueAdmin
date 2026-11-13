import { describe, it, expect } from 'vitest'
import { parseTitle, parseSkuSelector } from '../modules/shop/services/scrape1688Service.js'
import { extractOfferId, makeSlug } from '../modules/shop/utils/scrape1688.js'

/** mtop 包裹结构：真实 XHR 响应形状（data.skuSelectorBizModel.skuSelectorModel.tradeModel） */
const mtop = (tradeModel: unknown) => ({
  data: { skuSelectorBizModel: { skuSelectorModel: { tradeModel } } },
})

describe('parseSkuSelector 阶梯价语义', () => {
  it('多档阶梯价取起批价（beginAmount 最小档），不是最低单价', () => {
    const r = parseSkuSelector(mtop({
      offerPriceRanges: [
        { beginAmount: 500, price: '1.45' },
        { beginAmount: 2000, price: '1.35' },
        { beginAmount: 20000, price: '1.15' },
      ],
    }))
    // 起批价 = 最小 beginAmount 对应的价格 = 1.45（不是 min 1.15）
    expect(r.skus[0].price).toBe(1.45)
  })

  it('单 SKU 无 beginAmount 时取 price', () => {
    const r = parseSkuSelector(mtop({ offerPriceRanges: [{ price: '18.8' }] }))
    expect(r.skus[0].price).toBe(18.8)
  })

  it('主图提取 fullPathImageURI', () => {
    // mainImageList 挂在 skuSelectorModel 层（不在 tradeModel 下）
    const r = parseSkuSelector({ data: { skuSelectorBizModel: { skuSelectorModel: { mainImageList: [{ fullPathImageURI: 'https://cbu01.alicdn.com/img/a.jpg' }] } } } })
    expect(r.images).toEqual(['https://cbu01.alicdn.com/img/a.jpg'])
  })

  it('无有效数据时返回空', () => {
    const r = parseSkuSelector({})
    expect(r.images).toEqual([])
    expect(r.skus).toEqual([])
  })
})

describe('extractOfferId', () => {
  it('标准详情页 URL', () => {
    expect(extractOfferId('https://detail.1688.com/offer/989739058744.html')).toBe('989739058744')
  })
  it('移动端 URL', () => {
    expect(extractOfferId('https://m.1688.com/offer/989739058744.html')).toBe('989739058744')
  })
  it('非 1688 域名不校验域名（域名校验在控制器 offerUrlSchema）', () => {
    expect(extractOfferId('https://evil.com/offer/123.html')).toBe('123')
  })
})

describe('makeSlug', () => {
  it('标题可生成 slug 时用标题', () => {
    expect(makeSlug('蓝牙耳机', 'https://detail.1688.com/offer/123.html')).toBe('蓝牙耳机')
  })
  it('标题无法生成时用 offerId 兜底', () => {
    expect(makeSlug('!!!', 'https://detail.1688.com/offer/123456.html')).toBe('c1688-123456')
  })
})
