import { describe, it, expect } from 'vitest'
import { parseTitle, parseSkuSelector, parse1688Json } from '../modules/shop/services/scrape1688Service.js'

describe('parseTitle', () => {
  it('去掉「 - 阿里巴巴」尾巴', () => {
    expect(parseTitle('097双联立式电位器B20K - 阿里巴巴')).toBe('097双联立式电位器B20K')
  })

  it('去掉「 - 1688」尾巴', () => {
    expect(parseTitle('测试商品 - 1688')).toBe('测试商品')
  })

  it('无尾巴时原样返回', () => {
    expect(parseTitle('无线蓝牙耳机')).toBe('无线蓝牙耳机')
  })

  it('trim 空白', () => {
    expect(parseTitle('  商品标题 - 阿里巴巴  ')).toBe('商品标题')
  })

  it('null/空串返回 null', () => {
    expect(parseTitle(null)).toBeNull()
    expect(parseTitle('')).toBeNull()
    expect(parseTitle('   ')).toBeNull()
  })

  it('过短标题返回 null', () => {
    expect(parseTitle('a')).toBeNull()
  })
})

describe('parseSkuSelector', () => {
  /** 按真实响应结构（2026-11 实测）构造最小 payload */
  function realShape(mainImageList: unknown[], priceRanges: unknown[]) {
    return {
      data: {
        skuSelectorBizModel: {
          skuSelectorModel: {
            mainImageList,
            tradeModel: { offerPriceRanges: priceRanges },
          },
        },
      },
    }
  }

  it('null/undefined 返回空', () => {
    expect(parseSkuSelector(null)).toEqual({ images: [], skus: [] })
    expect(parseSkuSelector(undefined)).toEqual({ images: [], skus: [] })
  })

  it('缺少 skuSelectorModel 返回空', () => {
    expect(parseSkuSelector({ data: {} })).toEqual({ images: [], skus: [] })
  })

  it('提取 mainImageList 的 fullPathImageURI', () => {
    const r = parseSkuSelector(
      realShape(
        [
          { fullPathImageURI: 'https://cbu01.alicdn.com/img/ibank/a.jpg' },
          { fullPathImageURI: 'https://cbu01.alicdn.com/img/ibank/b.jpg' },
          { fullPathImageURI: 'not-http' }, // 非法，过滤
        ],
        [{ beginAmount: 500, price: '1.45' }],
      ),
    )
    expect(r.images).toEqual([
      'https://cbu01.alicdn.com/img/ibank/a.jpg',
      'https://cbu01.alicdn.com/img/ibank/b.jpg',
    ])
  })

  it('offerPriceRanges 取最低价', () => {
    const r = parseSkuSelector(realShape([], [
      { beginAmount: 500, price: '1.45' },
      { beginAmount: 2000, price: '1.35' },
      { beginAmount: 20000, price: '1.15' },
    ]))
    expect(r.skus).toEqual([{ spec: {}, price: 1.15 }])
  })

  it('disPriceRanges 兜底（offerPriceRanges 缺失时）', () => {
    const payload = {
      data: {
        skuSelectorBizModel: {
          skuSelectorModel: {
            mainImageList: [],
            tradeModel: { disPriceRanges: [{ beginAmount: 500, discountPrice: '2.5' }] },
          },
        },
      },
    }
    expect(parseSkuSelector(payload).skus).toEqual([{ spec: {}, price: 2.5 }])
  })

  it('currentPrices 兜底（offerPriceModel 结构）', () => {
    const payload = {
      data: {
        skuSelectorBizModel: {
          skuSelectorModel: {
            mainImageList: [],
            tradeModel: { offerPriceModel: { currentPrices: [{ beginAmount: 1, price: '18.8' }] } },
          },
        },
      },
    }
    expect(parseSkuSelector(payload).skus).toEqual([{ spec: {}, price: 18.8 }])
  })

  it('无价格数据返回空 skus', () => {
    const r = parseSkuSelector(realShape([], []))
    expect(r.skus).toEqual([])
  })

  it('过滤非法价格（负数/非数值）', () => {
    const r = parseSkuSelector(realShape([], [
      { beginAmount: 1, price: 'abc' },
      { beginAmount: 1, price: -5 },
      { beginAmount: 1, price: '9.9' },
    ]))
    expect(r.skus).toEqual([{ spec: {}, price: 9.9 }])
  })
})

describe('parse1688Json（兜底路径）', () => {
  it('非对象输入返回 null', () => {
    expect(parse1688Json(null)).toBeNull()
    expect(parse1688Json('string')).toBeNull()
    expect(parse1688Json(42)).toBeNull()
  })

  it('从 subject 提取标题', () => {
    const r = parse1688Json({ subject: '无线蓝牙耳机 高音质' })
    expect(r?.title).toBe('无线蓝牙耳机 高音质')
  })

  it('协议相对 URL 补全为 https', () => {
    const r = parse1688Json({ images: ['//cbu01.alicdn.com/img/x.webp'] })
    expect(r?.images?.[0]).toBe('https://cbu01.alicdn.com/img/x.webp')
  })

  it('过滤非法图片 URL', () => {
    const r = parse1688Json({ images: ['javascript:alert(1)', 'data:image/png;base64,xxx', '//ok.com/a.jpg'] })
    expect(r?.images).toEqual(['https://ok.com/a.jpg'])
  })

  it('无 SKU 列表时用顶层价格兜底为单 SKU', () => {
    const r = parse1688Json({ subject: '只有价格的商品', price: 129 })
    expect(r?.skus).toHaveLength(1)
    expect(r?.skus?.[0].price).toBe(129)
  })

  it('提取字符串形式 SKU 规格 "颜色:红色;尺码:L"', () => {
    const data = {
      skuList: [{ props: '颜色:红色;尺码:L', price: 59.9 }],
    }
    const r = parse1688Json(data)
    expect(r?.skus?.[0].spec).toEqual({ 颜色: '红色', 尺码: 'L' })
    expect(r?.skus?.[0].price).toBe(59.9)
  })

  it('提取数组形式 SKU 规格', () => {
    const data = {
      skuInfos: [{ props: [{ k: '颜色', v: '黑色' }], minPrice: 88 }],
    }
    const r = parse1688Json(data)
    expect(r?.skus?.[0].spec).toEqual({ 颜色: '黑色' })
    expect(r?.skus?.[0].price).toBe(88)
  })
})
