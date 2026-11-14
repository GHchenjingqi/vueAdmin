import { Op, Sequelize } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import type { StorefrontProductQuery } from '../../../shared/schemas/storefront.js'
import { getTenantContext } from '../../tenant/context.js'
import { expandTerm } from './searchSynonymsService.js'
import {
  ShopBrand,
  ShopCategory,
  ShopInventory,
  ShopProductPrice,
  ShopRateSnapshot,
  ShopReview,
  ShopSpu,
  ShopSku,
} from '../../shop/models/index.js'

/**
 * Storefront 商品浏览服务（只读）
 *
 * 与 shop 模块共用同一套 Sequelize 模型，不复制数据、不建第二套后端。
 * 硬约束：
 *  1. 只露出 listed / published；
 *  2. 显式组装返回对象做 C 端字段裁剪，绝不直接返回 Model 实例
 *     （不得泄漏 tenantId / hsCode / originCountry / declaredValue / compliance / barcode）；
 *  3. 所有查询 where 显式带 tenantId（全局 beforeFind 钩子对读不生效）。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1
const PUBLIC_STATUSES = ['listed', 'published']

export interface StorefrontCategory {
  id: number
  parentId: number
  name: string
  level: number
  sort: number
  children: StorefrontCategory[]
  /** 语义化 slug（/c/:slug）；历史行 slug 为空时回退 c-<id> 保持链接可用 */
  slug: string
}

export interface StorefrontProductListItem {
  id: number
  slug: string
  title: string
  cover: string | null
  images: string[]
  videos: string[]
  categoryId: number
  brandId: number | null
  /** 类目摘要（含语义 slug，便于列表页拼 /c/:slug 与面包屑） */
  category: { id: number; name: string; slug: string } | null
  price: { currency: string; min: number; max: number } | null
  inStock: boolean
  /** 已审核评价的均分（保留 2 位）；无评价为 null */
  ratingAvg: number | null
  /** 已审核评价数量 */
  reviewCount: number
  /** 商品最后更新时间（ISO），sitemap 的 lastmod 用 */
  updatedAt: string
}

export interface StorefrontVariant {
  id: number
  code: string
  spec: Record<string, string>
  price: number | null
  available: number
  inStock: boolean
}

export interface StorefrontProductDetail {
  id: number
  slug: string
  title: string
  description: string
  cover: string | null
  images: string[]
  videos: string[]
  category: { id: number; name: string; slug: string } | null
  brand: { id: number; name: string } | null
  currency: string
  price: { min: number; max: number } | null
  variants: StorefrontVariant[]
  seo: { title: string; description: string }
  /** 已审核评价聚合：用于 PDP 星级与 JSON-LD aggregateRating */
  ratingAvg: number | null
  reviewCount: number
}

/** service 层自身做参数规范化，不依赖 validate 中间件（BFF / 内部调用可能绕过 schema） */
function positiveInt(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > max) return fallback
  return value
}

function normalizeCurrency(value: unknown): string {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/.test(text) ? text : 'USD'
}

function normalizeLang(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 10) : 'en-US'
}

/** 多语言文本取当前语言，回退 en-US / zh-CN / 首个可用值 */
function localized(value: Record<string, string> | null | undefined, lang: string): string {
  if (!value) return ''
  return value[lang] ?? value['en-US'] ?? value['zh-CN'] ?? Object.values(value)[0] ?? ''
}

/** 生成式 SEO slug：{id}-{kebab(title)}。spus.slug 为空时的兜底（阶段 5 第 2 步） */
function makeSlug(id: number, title: string): string {
  const kebab = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${id}-${kebab || 'product'}`
}

/** 展示用 slug：优先真实列，缺失时回退生成式 */
function displaySlug(spu: { id: number; slug: string | null; name: Record<string, string> | null }, lang: string): string {
  return spu.slug || makeSlug(spu.id, localized(spu.name, lang))
}

/** LIKE 转义，防止 % _ \ 与单引号破坏 JSON_SEARCH 入参 */
function escapeLike(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/'/g, "''")
}

function parseSlugId(slug: string): number | undefined {
  const matched = /^(\d+)/.exec(slug)
  return matched ? Number(matched[1]) : undefined
}

function publicWhere(): { tenantId: number; status: Record<symbol, string[]> } {
  return { tenantId: tid(), status: { [Op.in]: [...PUBLIC_STATUSES] } }
}

/** 类目树（C 端字段裁剪） */
export async function listCategories(lang = 'en-US'): Promise<StorefrontCategory[]> {
  const rows = await ShopCategory.findAll({
    where: { tenantId: tid() },
    order: [
      ['sort', 'ASC'],
      ['id', 'ASC'],
    ],
  })
  const nodes = new Map<number, StorefrontCategory>()
  for (const row of rows) {
    nodes.set(row.id, {
      id: row.id,
      parentId: row.parentId,
      name: localized(row.name, lang),
      level: row.level,
      sort: row.sort,
      slug: row.slug || `c-${row.id}`,
      children: [],
    })
  }
  const roots: StorefrontCategory[] = []
  for (const node of nodes.values()) {
    const parent = nodes.get(node.parentId)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/**
 * 排序白名单：非法值一律回退 newest（不把用户输入拼进 SQL，也不做模糊匹配）
 */
type CatalogSort = 'newest' | 'price-asc' | 'price-desc'

function normalizeSort(value: unknown): CatalogSort {
  return value === 'price-asc' || value === 'price-desc' ? value : 'newest'
}

/**
 * 商品分页列表
 *
 * keyword 通过 JSON_SEARCH 推入 SQL 过滤：name/description 是 MySQL JSON 列，
 * 用 LOWER(CAST(... AS JSON)) 配合小写搜索词实现大小写不敏感的子串匹配（JSON_SEARCH 本身大小写敏感）。
 */
export async function listProducts(
  params: StorefrontProductQuery = {},
  defaults: { currency?: string; lang?: string } = {},
): Promise<{
  list: StorefrontProductListItem[]
  total: number
  page: number
  pageSize: number
  currency: string
  lang: string
}> {
  const page = positiveInt(params.page, 1)
  const pageSize = positiveInt(params.pageSize, 20, 60)
  const currency = normalizeCurrency(params.currency ?? defaults.currency)
  const lang = normalizeLang(params.lang ?? defaults.lang)

  const base = publicWhere()
  const categoryId = positiveInt(params.categoryId, 0)
  // 支持按语义 slug 过滤（BFF 传来的 category 是 slug）；解析失败回退为不按类目过滤
  const categorySlug = typeof params.category === 'string' ? params.category.trim() : ''
  let resolvedCategoryId = categoryId
  if (resolvedCategoryId <= 0 && categorySlug) {
    const bySlug = await ShopCategory.findOne({
      where: { tenantId: tid(), slug: categorySlug },
      attributes: ['id'],
    })
    // 兼容旧 c-<id> 链接
    const legacyId = /^c-(\d+)$/.exec(categorySlug)
    resolvedCategoryId = bySlug ? bySlug.id : legacyId ? Number(legacyId[1]) : 0
  }
  const where: Record<string | symbol, unknown> = resolvedCategoryId > 0 ? { ...base, categoryId: resolvedCategoryId } : { ...base }
  // 按 SPU id 列表精确取（收藏夹/最近看过）：显式带 tenantId + publicWhere，保持传入顺序
  const idsParam = typeof params.ids === 'string' ? params.ids : ''
  const idFilter = idsParam
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  if (idFilter.length) {
    where.id = { [Op.in]: idFilter }
  }

  // keyword 推入 SQL：JSON_SEARCH 大小写敏感，两侧均 LOWER 以保证不敏感
  // 二期：同义词 OR 展开（body wave 也命中 bodywave），整词精确别名组，不模糊
  const keyword = typeof params.keyword === 'string' ? params.keyword.trim() : ''
  if (keyword) {
    const variants = expandTerm(keyword)
    const orClauses = variants.map((v) => {
      const kw = escapeLike(v.toLowerCase())
      return `(JSON_SEARCH(LOWER(CAST(name AS JSON)),'all','%${kw}%') IS NOT NULL OR JSON_SEARCH(LOWER(CAST(description AS JSON)),'all','%${kw}%') IS NOT NULL)`
    })
    where[Op.and] = Sequelize.literal(`(${orClauses.join(' OR ')})`)
  }

  const rows = await ShopSpu.findAll({ where, order: [['id', 'DESC']] })

  // ids 精确取时保持调用方传入顺序（收藏按收藏时间、最近看过按浏览时间倒序）
  if (idFilter.length) {
    const orderMap = new Map(idFilter.map((id, idx) => [id, idx]))
    rows.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))
  }

  // 排序必须在分页前完成，否则只能对当前页重排，跨页顺序错乱。
  // newest 由 SQL 的 id DESC 保证；price-* 需要先取全量最低价才能正确排序。
  const sort = normalizeSort(params.sort)
  if (!idFilter.length && sort !== 'newest') {
    const allSpuIds = rows.map((r) => r.id)
    const allSkus = allSpuIds.length ? await ShopSku.findAll({ where: { tenantId: tid(), spuId: { [Op.in]: allSpuIds } } }) : []
    const allSkuIds = allSkus.map((s) => s.id)
    const allPrices = allSkuIds.length
      ? await ShopProductPrice.findAll({ where: { tenantId: tid(), skuId: { [Op.in]: allSkuIds }, currency } })
      : []
    const skuToSpuAll = new Map<number, number>()
    for (const s of allSkus) skuToSpuAll.set(s.id, s.spuId)
    const minPriceBySpu = new Map<number, number>()
    for (const p of allPrices) {
      const spuId = skuToSpuAll.get(p.skuId)
      if (spuId === undefined) continue
      const amount = Number(p.amount)
      const prev = minPriceBySpu.get(spuId)
      if (prev === undefined || amount < prev) minPriceBySpu.set(spuId, amount)
    }
    // 无价格的 SPU 排到最后：价格排序时买家最不想看到"暂无报价"
    rows.sort((a, b) => {
      const pa = minPriceBySpu.get(a.id)
      const pb = minPriceBySpu.get(b.id)
      if (pa === undefined && pb === undefined) return b.id - a.id
      if (pa === undefined) return 1
      if (pb === undefined) return -1
      return sort === 'price-asc' ? pa - pb : pb - pa
    })
  }

  const total = rows.length
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize)
  const spuIds = pageRows.map((row) => row.id)

  const skus = spuIds.length ? await ShopSku.findAll({ where: { tenantId: tid(), spuId: { [Op.in]: spuIds } } }) : []
  const skuIds = skus.map((sku) => sku.id)
  const prices = skuIds.length
    ? await ShopProductPrice.findAll({ where: { tenantId: tid(), skuId: { [Op.in]: skuIds }, currency } })
    : []
  const inventory = skuIds.length ? await ShopInventory.findAll({ where: { tenantId: tid(), skuId: { [Op.in]: skuIds } } }) : []

  const skuToSpu = new Map<number, number>()
  for (const sku of skus) skuToSpu.set(sku.id, sku.spuId)

  const priceBySpu = new Map<number, number[]>()
  for (const price of prices) {
    const spuId = skuToSpu.get(price.skuId)
    if (spuId === undefined) continue
    const values = priceBySpu.get(spuId) ?? []
    values.push(Number(price.amount))
    priceBySpu.set(spuId, values)
  }

  const availableBySpu = new Map<number, number>()
  for (const inv of inventory) {
    const spuId = skuToSpu.get(inv.skuId)
    if (spuId === undefined) continue
    const available = Math.max(0, Number(inv.quantity) - Number(inv.locked))
    availableBySpu.set(spuId, (availableBySpu.get(spuId) ?? 0) + available)
  }

  // 评分聚合：只统计已审核评价，按 spuId 分组一次查完（避免 N+1）
  const ratingBySpu = new Map<number, { avg: number; count: number }>()
  if (spuIds.length) {
    const rowsRating = (await ShopReview.findAll({
      where: { tenantId: tid(), spuId: { [Op.in]: spuIds }, status: 'approved' },
      attributes: ['spuId', [Sequelize.fn('AVG', Sequelize.col('rating')), 'avg'], [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
      group: ['spuId'],
      raw: true,
    })) as unknown as Array<{ spuId: number; avg: string | number; count: string | number }>
    for (const r of rowsRating) {
      const count = Number(r.count) || 0
      if (count <= 0) continue
      ratingBySpu.set(Number(r.spuId), { avg: Math.round(Number(r.avg) * 100) / 100, count })
    }
  }

  // 类目摘要映射（列表页需要类目名与语义 slug，供商品卡面包屑与 /c/:slug 链接）
  const categoryIds = [...new Set(pageRows.map((r) => r.categoryId).filter((id) => id > 0))]
  const categoryRows = categoryIds.length ? await ShopCategory.findAll({ where: { tenantId: tid(), id: { [Op.in]: categoryIds } } }) : []
  const categoryById = new Map<number, { id: number; name: string; slug: string }>()
  for (const c of categoryRows) {
    categoryById.set(c.id, { id: c.id, name: localized(c.name, lang), slug: c.slug || `c-${c.id}` })
  }

  const list: StorefrontProductListItem[] = pageRows.map((spu) => {
    const values = priceBySpu.get(spu.id) ?? []
    const title = localized(spu.name, lang)
    return {
      id: spu.id,
      slug: displaySlug(spu, lang),
      title,
      cover: spu.cover,
      images: spu.images ?? [],
      videos: spu.videos ?? [],
      categoryId: spu.categoryId,
      brandId: spu.brandId,
      category: categoryById.get(spu.categoryId) ?? null,
      ratingAvg: ratingBySpu.get(spu.id)?.avg ?? null,
      reviewCount: ratingBySpu.get(spu.id)?.count ?? 0,
      updatedAt: spu.updatedAt ? new Date(spu.updatedAt as Date).toISOString() : new Date(0).toISOString(),
      price: values.length ? { currency, min: Math.min(...values), max: Math.max(...values) } : null,
      inStock: (availableBySpu.get(spu.id) ?? 0) > 0,
    }
  })

  // 二期：keyword 检索排序加权（仅 keyword 非空且非 ids 精确取时启用；当前页内存重排，零额外查询）
  // 优先级：标题含完整关键词 > 标题含任一同义变体 > 有货 > 原顺序（id DESC 稳定兜底）
  if (keyword && !idFilter.length) {
    const variants = expandTerm(keyword)
    const normTitle = (t: string) => t.toLowerCase()
    const kwLower = keyword.toLowerCase()
    const score = (item: StorefrontProductListItem): number => {
      const title = normTitle(item.title)
      let s = 0
      if (title.includes(kwLower)) s += 100
      else if (variants.some((v) => v !== kwLower && title.includes(v))) s += 60
      if (item.inStock) s += 10
      return s
    }
    // 稳定排序：JS sort 在现代引擎为稳定排序，同分保持原顺序（id DESC）
    list.sort((a, b) => score(b) - score(a))
  }

  return { list, total, page, pageSize, currency, lang }
}

/** 商品详情：SPU + SKU 变体 + 多币种价格 + 跨仓可用库存 + SEO 字段 */
export async function getProductBySlug(
  slug: string,
  defaults: { currency?: string; lang?: string } = {},
): Promise<StorefrontProductDetail> {
  const currency = normalizeCurrency(defaults.currency)
  const lang = normalizeLang(defaults.lang)
  const base = publicWhere()

  // 解析优先级：纯数字 → 按 id；否则先按真实 slug 列；最后兜底旧生成式 slug（兼容历史 URL）
  let spu: ShopSpu | null = null
  if (/^\d+$/.test(slug)) {
    spu = await ShopSpu.findOne({ where: { ...base, id: Number(slug) } })
  } else {
    spu = await ShopSpu.findOne({ where: { ...base, slug } })
    if (!spu) {
      const id = parseSlugId(slug)
      if (id !== undefined) {
        const byId = await ShopSpu.findOne({ where: { ...base, id } })
        if (byId && makeSlug(byId.id, localized(byId.name, lang)) === slug) spu = byId
      }
    }
  }
  if (!spu) throw new AppError(404, '商品不存在')

  const skus = await ShopSku.findAll({ where: { tenantId: tid(), spuId: spu.id } })
  const skuIds = skus.map((sku) => sku.id)
  const priceRows = skuIds.length ? await ShopProductPrice.findAll({ where: { tenantId: tid(), skuId: { [Op.in]: skuIds } } }) : []
  const inventory = skuIds.length ? await ShopInventory.findAll({ where: { tenantId: tid(), skuId: { [Op.in]: skuIds } } }) : []
  const category = await ShopCategory.findOne({ where: { id: spu.categoryId, tenantId: tid() } })
  const brand = spu.brandId ? await ShopBrand.findOne({ where: { id: spu.brandId, tenantId: tid() } }) : null

  let scopedPrices = priceRows.filter((price) => price.currency.toUpperCase() === currency)
  const effectiveCurrency = scopedPrices.length ? currency : (priceRows[0]?.currency.toUpperCase() ?? currency)
  if (!scopedPrices.length) scopedPrices = priceRows

  const priceBySku = new Map<number, number>()
  for (const price of scopedPrices) priceBySku.set(price.skuId, Number(price.amount))

  const availableBySku = new Map<number, number>()
  for (const inv of inventory) {
    const available = Math.max(0, Number(inv.quantity) - Number(inv.locked))
    availableBySku.set(inv.skuId, (availableBySku.get(inv.skuId) ?? 0) + available)
  }

  const variants: StorefrontVariant[] = skus.map((sku) => {
    const available = availableBySku.get(sku.id) ?? 0
    return {
      id: sku.id,
      code: sku.code,
      spec: sku.spec ?? {},
      price: priceBySku.get(sku.id) ?? null,
      available,
      inStock: available > 0,
    }
  })
  const priceValues = variants.map((variant) => variant.price).filter((value): value is number => value !== null)

  // 详情页评分聚合（单 SPU，直接聚合一次）
  const ratingAgg = (await ShopReview.findOne({
    where: { tenantId: tid(), spuId: spu.id, status: 'approved' },
    attributes: [[Sequelize.fn('AVG', Sequelize.col('rating')), 'avg'], [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
    raw: true,
  })) as unknown as { avg: string | number | null; count: string | number } | null
  const reviewCount = Number(ratingAgg?.count ?? 0) || 0
  const detailRating = {
    avg: reviewCount > 0 ? Math.round(Number(ratingAgg?.avg ?? 0) * 100) / 100 : null,
    count: reviewCount,
  }

  const title = localized(spu.name, lang)
  const description = localized(spu.description, lang)
  return {
    id: spu.id,
    slug: displaySlug(spu, lang),
    title,
    description,
    cover: spu.cover,
    images: spu.images ?? [],
    videos: spu.videos ?? [],
    category: category
      ? { id: category.id, name: localized(category.name, lang), slug: category.slug || `c-${category.id}` }
      : null,
    brand: brand ? { id: brand.id, name: brand.name } : null,
    currency: effectiveCurrency,
    price: priceValues.length ? { min: Math.min(...priceValues), max: Math.max(...priceValues) } : null,
    variants,
    seo: { title, description: description.slice(0, 160) },
    ratingAvg: detailRating.avg,
    reviewCount: detailRating.count,
  }
}

/** 最新汇率快照（C 端换算用；无快照返回 null，不抛错） */
export async function getRateSnapshot(base = 'USD'): Promise<{ baseCurrency: string; rateDate: string; rates: Record<string, number> } | null> {
  const row = await ShopRateSnapshot.findOne({
    where: { tenantId: tid(), baseCurrency: base.toUpperCase() },
    order: [['rateDate', 'DESC']],
  })
  return row ? { baseCurrency: row.baseCurrency, rateDate: row.rateDate, rates: row.rates } : null
}
