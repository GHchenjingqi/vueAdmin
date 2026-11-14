// @vitest-environment node
/**
 * Storefront 公开接口（阶段 5 第 1 步）服务层测试
 *
 * 覆盖：状态过滤（draft 不露出）、keyword 过滤、C 端字段裁剪、slug 详情组装
 * （变体/价格/跨仓库存/SEO）、类目树、汇率快照、跨租户隔离。
 * 依赖已迁移的测试库与租户上下文（runInTenant）。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import * as categoryService from '../modules/shop/services/categoryService.js'
import * as brandService from '../modules/shop/services/brandService.js'
import * as spuService from '../modules/shop/services/spuService.js'
import * as skuService from '../modules/shop/services/skuService.js'
import * as priceService from '../modules/shop/services/priceService.js'
import * as rateService from '../modules/shop/services/rateService.js'
import * as warehouseService from '../modules/shop/services/warehouseService.js'
import * as inventoryService from '../modules/shop/services/inventoryService.js'
import * as catalogService from '../modules/storefront/services/catalogService.js'
import { setPromotionEvaluator } from '../modules/storefront/services/promotionService.js'

const TID = 1

function uniq(): string {
  return `sf${Date.now()}${Math.floor(Math.random() * 1e6)}`
}

let categoryId = 0
let publishedSpuId = 0
let publishedSkuId = 0
let draftSpuId = 0
let publishedKeyword = ''
let draftKeyword = ''

beforeAll(async () => {
  // 隔离：共享测试库里可能存在其它用例/并行会话建的促销活动（8 折），
  // 会让本文件的金额断言随环境漂移。这里显式关闭促销求值。
  setPromotionEvaluator(async () => null)
  await runInTenant({ tenantId: TID }, async () => {
    const category = await categoryService.createCategory({
      parentId: 0,
      name: { 'en-US': 'Storefront Cat ' + uniq(), 'zh-CN': '前台类目' },
      level: 1,
      sort: 0,
    })
    categoryId = category.id
    const brand = await brandService.createBrand({ name: 'Storefront Brand ' + uniq() })
    const warehouse = await warehouseService.createWarehouse({ name: 'SF Warehouse ' + uniq(), type: 'overseas', country: 'US' })

    // 公开商品：完整状态机流转到 published，带价格与库存
    publishedKeyword = 'BodyWaveWig' + uniq()
    const spu = await spuService.createSpu({
      categoryId,
      brandId: brand.id,
      name: { 'en-US': publishedKeyword, 'zh-CN': '波浪假发' },
      description: { 'en-US': 'Glueless body wave human hair wig', 'zh-CN': '免胶波浪真发假发' },
      cover: 'https://example.com/cover.jpg',
      images: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
    })
    publishedSpuId = spu.id
    const sku = await skuService.createSku({
      spuId: spu.id,
      code: 'SKU' + uniq(),
      spec: { color: '1B', length: '20 inch' },
      originCountry: 'CN',
      hsCode: '67041100',
      declaredValue: 20,
      barcode: 'INTERNAL-BARCODE',
    })
    publishedSkuId = sku.id
    await priceService.upsertPrice(sku.id, { currency: 'USD', amount: 129.9 })
    await priceService.upsertPrice(sku.id, { currency: 'EUR', amount: 119 })
    await inventoryService.adjust(sku.id, warehouse.id, 50)
    await spuService.changeSpuStatus(spu.id, 'submit')
    await spuService.changeSpuStatus(spu.id, 'list')
    await spuService.changeSpuStatus(spu.id, 'publish')

    // 草稿商品：不应在 C 端露出
    draftKeyword = 'DraftHiddenWig' + uniq()
    const draft = await spuService.createSpu({
      categoryId,
      brandId: brand.id,
      name: { 'en-US': draftKeyword, 'zh-CN': '草稿假发' },
    })
    draftSpuId = draft.id
    await skuService.createSku({ spuId: draft.id, code: 'SKU' + uniq() })

    await rateService.saveRateSnapshot({
      baseCurrency: 'USD',
      rates: { EUR: 0.92, GBP: 0.79 },
      rateDate: '2026-11-04',
    })
  })
})

describe('阶段5：Storefront 商品列表', () => {
  it('仅返回 listed/published，draft 商品不露出', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const published = await catalogService.listProducts({ keyword: publishedKeyword })
      expect(published.total).toBe(1)
      expect(published.list[0].id).toBe(publishedSpuId)

      const draft = await catalogService.listProducts({ keyword: draftKeyword })
      expect(draft.total).toBe(0)
    })
  })

  it('keyword 大小写不敏感，且分页参数生效', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const upper = await catalogService.listProducts({ keyword: publishedKeyword.toUpperCase() })
      expect(upper.total).toBe(1)
      const emptyPage = await catalogService.listProducts({ keyword: publishedKeyword, page: 2, pageSize: 1 })
      expect(emptyPage.total).toBe(1)
      expect(emptyPage.list).toHaveLength(0)
      expect(emptyPage.page).toBe(2)
      expect(emptyPage.pageSize).toBe(1)
    })
  })

  it('列表项做了 C 端字段裁剪，不泄漏内部与合规字段', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const { list } = await catalogService.listProducts({ keyword: publishedKeyword })
      const item = list[0]
      expect(Object.keys(item).sort()).toEqual(
        // PLAN 2.4 / 2.5 / 2.6 新增的公开字段：评分聚合、类目摘要、更新时间（sitemap lastmod）
        [
          'brandId',
          'category',
          'categoryId',
          'cover',
          'id',
          'images',
          'inStock',
          'price',
          'ratingAvg',
          'reviewCount',
          'slug',
          'title',
          'updatedAt',
          'videos',
        ].sort(),
      )
      expect(item.price).toEqual({ currency: 'USD', min: 129.9, max: 129.9 })
      expect(item.inStock).toBe(true)
      expect(item.slug.startsWith(`${publishedSpuId}-`)).toBe(true)
      expect(JSON.stringify(item)).not.toContain('hsCode')
      expect(JSON.stringify(item)).not.toContain('tenantId')
    })
  })

  it('categoryId 筛选生效，非法分页值降级为默认值', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const hit = await catalogService.listProducts({ keyword: publishedKeyword, categoryId })
      expect(hit.total).toBe(1)
      const miss = await catalogService.listProducts({ keyword: publishedKeyword, categoryId: 999999 })
      expect(miss.total).toBe(0)
      const fallback = await catalogService.listProducts({ keyword: publishedKeyword, page: -1 } as never)
      expect(fallback.page).toBe(1)
    })
  })
})

describe('阶段5：Storefront 商品详情', () => {
  it('按 id 或生成式 slug 均可查到，且组装变体/价格/库存/SEO', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const byId = await catalogService.getProductBySlug(String(publishedSpuId))
      expect(byId.id).toBe(publishedSpuId)
      expect(byId.title).toBe(publishedKeyword)
      expect(byId.currency).toBe('USD')
      expect(byId.price).toEqual({ min: 129.9, max: 129.9 })
      expect(byId.images).toHaveLength(2)
      expect(byId.variants).toHaveLength(1)
      expect(byId.variants[0]).toMatchObject({ id: publishedSkuId, price: 129.9, available: 50, inStock: true })
      expect(byId.seo.title).toBe(publishedKeyword)

      const bySlug = await catalogService.getProductBySlug(byId.slug)
      expect(bySlug.id).toBe(publishedSpuId)
    })
  })

  it('详情同样做字段裁剪，不泄漏 barcode / 合规字段', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const detail = await catalogService.getProductBySlug(String(publishedSpuId))
      const raw = JSON.stringify(detail)
      for (const key of ['tenantId', 'hsCode', 'originCountry', 'declaredValue', 'compliance', 'barcode', 'INTERNAL-BARCODE']) {
        expect(raw).not.toContain(key)
      }
    })
  })

  it('多币种按 currency 取价；无该币种时回退可用币种', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const eur = await catalogService.getProductBySlug(String(publishedSpuId), { currency: 'EUR' })
      expect(eur.currency).toBe('EUR')
      expect(eur.variants[0].price).toBe(119)

      const gbp = await catalogService.getProductBySlug(String(publishedSpuId), { currency: 'GBP' })
      expect(gbp.currency).not.toBe('GBP')
      expect(gbp.variants[0].price).not.toBeNull()
    })
  })

  it('不存在 / draft / archived 态商品一律 404', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await expect(catalogService.getProductBySlug('99999999-not-exist')).rejects.toThrow('商品不存在')
      await expect(catalogService.getProductBySlug(String(draftSpuId))).rejects.toThrow('商品不存在')
      await expect(catalogService.getProductBySlug('no-numeric-slug')).rejects.toThrow('商品不存在')
    })
  })
})

describe('阶段5：类目树 / 汇率快照 / 租户隔离', () => {
  it('类目树返回本地化字符串而非多语言 JSON', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const tree = await catalogService.listCategories('en-US')
      const flat = (items: catalogService.StorefrontCategory[]): catalogService.StorefrontCategory[] =>
        items.flatMap((item) => [item, ...flat(item.children)])
      const found = flat(tree).find((item) => item.id === categoryId)
      expect(found).toBeDefined()
      expect(typeof found?.name).toBe('string')
      expect(JSON.stringify(tree)).not.toContain('tenantId')
    })
  })

  it('汇率快照按 baseCurrency 取最新，无快照返回 null', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const usd = await catalogService.getRateSnapshot('USD')
      expect(usd).not.toBeNull()
      expect(usd?.rates.EUR).toBe(0.92)
      expect(await catalogService.getRateSnapshot('JPY')).toBeNull()
    })
  })

  it('跨租户读隔离：tenantId=999 查不到 tenantId=1 的公开商品', async () => {
    await runInTenant({ tenantId: 999 }, async () => {
      const result = await catalogService.listProducts({ keyword: publishedKeyword })
      expect(result.total).toBe(0)
      await expect(catalogService.getProductBySlug(String(publishedSpuId))).rejects.toThrow('商品不存在')
    })
  })
})

describe('阶段5 第2步：slug 列 + 后台可编辑 + JSON_SEARCH', () => {
  it('后台可编辑 slug：C 端返回真实 slug 且可按 slug 直接查到', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const category = await categoryService.createCategory({
        parentId: 0,
        name: { 'en-US': 'SlugCat ' + uniq(), 'zh-CN': 'slug类目' },
        level: 1,
        sort: 0,
      })
      const brand = await brandService.createBrand({ name: 'SlugBrand ' + uniq() })
      const warehouse = await warehouseService.createWarehouse({ name: 'SlugWH ' + uniq(), type: 'overseas', country: 'US' })
      const customSlug = 'custom-slug-' + uniq().toLowerCase()
      const spu = await spuService.createSpu({
        categoryId: category.id,
        brandId: brand.id,
        name: { 'en-US': 'Slugged Wig ' + uniq(), 'zh-CN': '带slug假发' },
        slug: customSlug,
      })
      const sku = await skuService.createSku({
        spuId: spu.id,
        code: 'SKU' + uniq(),
        originCountry: 'CN',
        hsCode: '67041100',
        declaredValue: 10,
      })
      await inventoryService.adjust(sku.id, warehouse.id, 10)
      await spuService.changeSpuStatus(spu.id, 'submit')
      await spuService.changeSpuStatus(spu.id, 'list')
      await spuService.changeSpuStatus(spu.id, 'publish')

      const list = await catalogService.listProducts({ keyword: 'Slugged' })
      const item = list.list.find((x) => x.id === spu.id)
      expect(item).toBeDefined()
      expect(item?.slug).toBe(customSlug)

      const detail = await catalogService.getProductBySlug(customSlug)
      expect(detail.id).toBe(spu.id)
      expect(detail.slug).toBe(customSlug)
    })
  })

  it('未设置 slug 时回退生成式 slug（兼容旧链接）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const category = await categoryService.createCategory({
        parentId: 0,
        name: { 'en-US': 'FallbackCat ' + uniq() },
        level: 1,
        sort: 0,
      })
      const spu = await spuService.createSpu({
        categoryId: category.id,
        name: { 'en-US': 'Fallback Wig ' + uniq() },
      })
      await skuService.createSku({ spuId: spu.id, code: 'SKU' + uniq(), originCountry: 'CN', hsCode: '67041100', declaredValue: 10 })
      await spuService.changeSpuStatus(spu.id, 'submit')
      await spuService.changeSpuStatus(spu.id, 'list')
      await spuService.changeSpuStatus(spu.id, 'publish')

      const detail = await catalogService.getProductBySlug(String(spu.id))
      expect(detail.slug.startsWith(`${spu.id}-`)).toBe(true)
    })
  })

  it('JSON_SEARCH 全文检索：子串大小写不敏感命中，乱码不命中', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const hit = await catalogService.listProducts({ keyword: 'slugged' })
      expect(hit.list.some((x) => x.slug.startsWith('custom-slug-'))).toBe(true)

      const miss = await catalogService.listProducts({ keyword: 'zzz-no-such-product-zzz' })
      expect(miss.total).toBe(0)
    })
  })

  it('slug 租户内唯一：重复 slug 报 409', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const category = await categoryService.createCategory({
        parentId: 0,
        name: { 'en-US': 'DupCat ' + uniq() },
        level: 1,
        sort: 0,
      })
      const dup = 'dup-slug-' + uniq().toLowerCase()
      await spuService.createSpu({ categoryId: category.id, name: { 'en-US': 'Dup A ' + uniq() }, slug: dup })
      await expect(
        spuService.createSpu({ categoryId: category.id, name: { 'en-US': 'Dup B ' + uniq() }, slug: dup }),
      ).rejects.toThrow()
      // 不同租户允许相同 slug
      await runInTenant({ tenantId: 999 }, async () => {
        const c2 = await categoryService.createCategory({ parentId: 0, name: { 'en-US': 'DupCat2 ' + uniq() }, level: 1, sort: 0 })
        await expect(spuService.createSpu({ categoryId: c2.id, name: { 'en-US': 'Dup C ' + uniq() }, slug: dup })).resolves.toBeDefined()
      })
    })
  })
})

describe('阶段5：Storefront 顾客认证（步骤 3）', () => {
  it('register 成功返回顾客与 JWT，且不泄漏密码哈希', async () => {
    const customerService = await import('../modules/shop/services/customerService.js')
    await runInTenant({ tenantId: TID }, async () => {
      const email = `cust-${uniq()}@example.com`
      const { customer, token } = await customerService.registerCustomer({
        tenantId: TID, email, password: 'secret1234', nickname: 'Ada',
      })
      expect(customer.email).toBe(email)
      expect(customer.nickname).toBe('Ada')
      expect(JSON.stringify(customer)).not.toContain('passwordHash')
      expect(token.split('.')).toHaveLength(3)
    })
  })

  it('重复邮箱注册返回 409', async () => {
    const customerService = await import('../modules/shop/services/customerService.js')
    await runInTenant({ tenantId: TID }, async () => {
      const email = `dup-${uniq()}@example.com`
      await customerService.registerCustomer({ tenantId: TID, email, password: 'secret1234' })
      await expect(
        customerService.registerCustomer({ tenantId: TID, email, password: 'secret1234' }),
      ).rejects.toThrow(/已注册/)
    })
  })

  it('login 成功；错误密码 401；禁用账号 403', async () => {
    const customerService = await import('../modules/shop/services/customerService.js')
    const { ShopCustomer } = await import('../modules/shop/models/index.js')
    await runInTenant({ tenantId: TID }, async () => {
      const email = `login-${uniq()}@example.com`
      await customerService.registerCustomer({ tenantId: TID, email, password: 'secret1234' })

      const ok = await customerService.authenticateCustomer({ tenantId: TID, email, password: 'secret1234' })
      expect(ok.token.split('.')).toHaveLength(3)

      await expect(
        customerService.authenticateCustomer({ tenantId: TID, email, password: 'wrongpass' }),
      ).rejects.toThrow(/邮箱或密码错误/)

      await ShopCustomer.update({ status: 'blocked' }, { where: { tenantId: TID, email } })
      await expect(
        customerService.authenticateCustomer({ tenantId: TID, email, password: 'secret1234' }),
      ).rejects.toThrow(/禁用/)
    })
  })

  it('顾客数据跨租户隔离', async () => {
    const customerService = await import('../modules/shop/services/customerService.js')
    await runInTenant({ tenantId: TID }, async () => {
      const email = `iso-${uniq()}@example.com`
      const { customer } = await customerService.registerCustomer({ tenantId: TID, email, password: 'secret1234' })
      await runInTenant({ tenantId: 999 }, async () => {
        await expect(customerService.getCustomerById(999, customer.id)).rejects.toThrow(/顾客不存在/)
      })
    })
  })

  it('customerAuth 中间件解析顾客 JWT；拒绝 admin 令牌', async () => {
    const customerService = await import('../modules/shop/services/customerService.js')
    const { customerAuth } = await import('../modules/storefront/middleware/customerAuth.js')
    const jwt = (await import('jsonwebtoken')).default
    const config = (await import('../config/index.js')).default
    await runInTenant({ tenantId: TID }, async () => {
      const email = `mw-${uniq()}@example.com`
      const { customer, token } = await customerService.registerCustomer({ tenantId: TID, email, password: 'secret1234' })

      const req: any = { headers: { authorization: `Bearer ${token}` } }
      const nextOk = (err?: unknown) => { if (err) throw err }
      // customerAuth 为异步中间件（需实时校验账号状态），故须 await
      await customerAuth(req, {} as any, nextOk as any)
      expect(req.customer?.customerId).toBe(customer.id)
      expect(req.customer?.tenantId).toBe(TID)

      // admin 令牌使用不同 secret，且 type 不匹配，应被拒绝
      const adminToken = jwt.sign({ id: 1, username: 'admin', type: 'admin' }, config.jwt.secret)
      const reqBad: any = { headers: { authorization: `Bearer ${adminToken}` } }
      const rejectNext = (err?: unknown) => { if (err) throw err }
      await expect(customerAuth(reqBad, {} as any, rejectNext as any)).rejects.toThrow()
    })
  })
})
