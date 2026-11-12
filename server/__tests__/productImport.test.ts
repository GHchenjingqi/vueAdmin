import { describe, it, expect } from 'vitest'
import {
  rowsToRawRecords,
  buildPlan,
  parseCsv,
  type RawRow,
} from '../modules/shop/services/productImportService.js'

// CSV 解析：RFC 4180 引号包裹 + 内嵌逗号/换行
describe('parseCsv', () => {
  it('简单逗号分隔', () => {
    const r = parseCsv('a,b,c\n1,2,3')
    expect(r).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('双引号包裹：内嵌逗号', () => {
    const r = parseCsv('name,desc\n"Hello, World","abc"')
    expect(r[1]).toEqual(['Hello, World', 'abc'])
  })

  it('双引号转义：内嵌双引号', () => {
    const r = parseCsv('a,b\n"he said ""hi""",x')
    expect(r[1][0]).toBe('he said "hi"')
  })

  it('CRLF 换行正确处理', () => {
    const r = parseCsv('a,b\r\n1,2\r\n3,4')
    expect(r).toEqual([['a', 'b'], ['1', '2'], ['3', '4']])
  })
})

// 表头归一化
describe('rowsToRawRecords', () => {
  it('表头别名归一化（大写/下划线/驼峰→标准名）', () => {
    const raw = rowsToRawRecords([
      ['Category_ID', 'SKU_CODE', 'Name_EN', 'Currency', 'Amount'],
      ['1', 'SKU-1', 'Test', 'USD', '10.99'],
    ])
    expect(raw.header).toContain('categoryId')
    expect(raw.header).toContain('skuCode')
    expect(raw.header).toContain('nameEn')
    expect(raw.records[0].categoryId).toBe('1')
    expect(raw.records[0].skuCode).toBe('SKU-1')
  })

  it('空行跳过并计数', () => {
    const raw = rowsToRawRecords([
      ['skuCode', 'amount'],
      ['SKU-1', '10'],
      ['', ''],
      [],
      ['SKU-2', '20'],
    ])
    expect(raw.records).toHaveLength(2)
    expect(raw.skippedEmpty).toBe(2)
  })

  it('空输入返回空', () => {
    const raw = rowsToRawRecords([])
    expect(raw.records).toHaveLength(0)
    expect(raw.header).toHaveLength(0)
  })
})

// buildPlan：SPU 归并 + 校验 + 错误收集
describe('buildPlan', () => {
  const mkRow = (o: Partial<RawRow>): RawRow => ({
    categoryId: '1',
    slug: '',
    nameEn: 'Test',
    nameZh: '',
    descriptionEn: '',
    cover: '',
    images: '',
    skuCode: '',
    spec: '',
    barcode: '',
    hsCode: '',
    originCountry: '',
    declaredValue: '',
    currency: '',
    amount: '',
    ...o,
  })

  it('正常单 SPU 单 SKU 导入', () => {
    const plan = buildPlan([mkRow({ skuCode: 'SKU-1', currency: 'USD', amount: '19.99' })])
    expect(plan.errors).toHaveLength(0)
    expect(plan.spus).toHaveLength(1)
    expect(plan.spus[0].skus).toHaveLength(1)
    expect(plan.spus[0].skus[0].skuCode).toBe('SKU-1')
    expect(plan.spus[0].skus[0].price).toEqual({ currency: 'USD', amount: 19.99 })
  })

  it('同一 slug 多行归并为一个 SPU 多个 SKU', () => {
    const plan = buildPlan([
      mkRow({ slug: 'wig-lace', skuCode: 'SKU-A', currency: 'USD', amount: '50' }),
      mkRow({ slug: 'wig-lace', skuCode: 'SKU-B', currency: 'USD', amount: '60' }),
      mkRow({ slug: 'wig-lace', skuCode: 'SKU-C', currency: 'USD', amount: '70' }),
    ])
    expect(plan.errors).toHaveLength(0)
    expect(plan.spus).toHaveLength(1)
    expect(plan.spus[0].slug).toBe('wig-lace')
    expect(plan.spus[0].skus).toHaveLength(3)
  })

  it('空 slug 每行独立 SPU（每行是不同商品）', () => {
    const plan = buildPlan([
      mkRow({ skuCode: 'A', amount: '10', currency: 'USD' }),
      mkRow({ skuCode: 'B', amount: '20', currency: 'USD' }),
    ])
    expect(plan.spus).toHaveLength(2)
  })

  it('必填字段缺失→行级错误', () => {
    const plan = buildPlan([mkRow({ categoryId: '', skuCode: '', nameEn: '' })])
    expect(plan.errors.length).toBeGreaterThan(0)
    const fields = plan.errors.map((e) => e.field)
    expect(fields).toContain('categoryId')
    expect(fields).toContain('skuCode')
    expect(fields).toContain('name_en')
  })

  it('currency 单独提供（缺 amount）→ 报错', () => {
    const plan = buildPlan([mkRow({ skuCode: 'S1', currency: 'USD', amount: '' })])
    expect(plan.errors).toContainEqual(expect.objectContaining({ field: 'currency/amount' }))
  })

  it('amount 为负→报错', () => {
    const plan = buildPlan([mkRow({ skuCode: 'S1', currency: 'USD', amount: '-5' })])
    expect(plan.errors).toContainEqual(expect.objectContaining({ field: 'amount' }))
  })

  it('currency 非法（非 3 位大写）→报错', () => {
    const plan = buildPlan([mkRow({ skuCode: 'S1', currency: 'us', amount: '10' })])
    expect(plan.errors).toContainEqual(expect.objectContaining({ field: 'currency' }))
  })

  it('slug 格式非法→报错', () => {
    const plan = buildPlan([mkRow({ skuCode: 'S1', slug: 'Invalid Slug!', currency: 'USD', amount: '10' })])
    expect(plan.errors).toContainEqual(expect.objectContaining({ field: 'slug' }))
  })

  it('skuCode 批内重复→报错并跳过', () => {
    const plan = buildPlan([
      mkRow({ slug: 'same', skuCode: 'DUP', currency: 'USD', amount: '10' }),
      mkRow({ slug: 'same', skuCode: 'DUP', currency: 'USD', amount: '20' }),
    ])
    const dupErrors = plan.errors.filter((e) => e.field === 'skuCode' && e.message.includes('重复'))
    expect(dupErrors).toHaveLength(1)
    // 第一个 DUP 进 SPU，第二个被拒
    expect(plan.spus[0].skus).toHaveLength(1)
  })

  it('originCountry 非 2 位→报错', () => {
    const plan = buildPlan([mkRow({ skuCode: 'S1', currency: 'USD', amount: '10', originCountry: 'CHN' })])
    expect(plan.errors).toContainEqual(expect.objectContaining({ field: 'originCountry' }))
  })

  it('cover 非 URL→报错', () => {
    const plan = buildPlan([mkRow({ skuCode: 'S1', currency: 'USD', amount: '10', cover: 'not-a-url' })])
    expect(plan.errors).toContainEqual(expect.objectContaining({ field: 'cover' }))
  })

  it('spec 解析：key=val;key=val', () => {
    const plan = buildPlan([mkRow({ skuCode: 'S1', currency: 'USD', amount: '10', spec: 'color=Red;size=M' })])
    expect(plan.spus[0].skus[0].spec).toEqual({ color: 'Red', size: 'M' })
  })

  it('images 解析：分号分隔 URL 过滤非法项', () => {
    const plan = buildPlan([mkRow({
      skuCode: 'S1', currency: 'USD', amount: '10',
      images: 'https://a.com/1.jpg;https://b.com/2.jpg;invalid',
    })])
    expect(plan.spus[0].images).toEqual(['https://a.com/1.jpg', 'https://b.com/2.jpg'])
  })

  it('多语言 name 归并（前行有 en，后行有 zh）', () => {
    const plan = buildPlan([
      mkRow({ slug: 'p', skuCode: 'A', nameEn: 'Wig', nameZh: '', currency: 'USD', amount: '10' }),
      mkRow({ slug: 'p', skuCode: 'B', nameEn: '', nameZh: '假发', currency: 'USD', amount: '12' }),
    ])
    expect(plan.spus[0].name).toEqual({ en: 'Wig', 'zh-CN': '假发' })
  })

  it('totalRows 等于非空行数', () => {
    const plan = buildPlan([mkRow({ skuCode: 'A', currency: 'USD', amount: '10' }), mkRow({ skuCode: 'B', currency: 'USD', amount: '20' })])
    expect(plan.totalRows).toBe(2)
  })
})
