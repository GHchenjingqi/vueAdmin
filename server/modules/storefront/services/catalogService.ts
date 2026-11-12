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
}

export interface StorefrontProductListItem {
  id: number
  slug: string
  title: string
  cover: string | null
  images: string[]
  categoryId: number
  brandId: number | null
  price: { currency: string; min: number; max: number } | null
  inStock: boolean
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
  category: { id: number; name: string } | null
  brand: { id: number; name: string } | null
  currency: string
  price: { min: number; max: number } | null
  variants: StorefrontVariant[]
  seo: { title: string; description: string }
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
  const where: Record<string | symbol, unknown> = categoryId > 0 ? { ...base, categoryId } : { ...base }

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

  const list: StorefrontProductListItem[] = pageRows.map((spu) => {
    const title = localized(spu.name, lang)
    const values = priceBySpu.get(spu.id) ?? []
    return {
      id: spu.id,
      slug: displaySlug(spu, lang),
      title,
      cover: spu.cover,
      images: spu.images ?? [],
      categoryId: spu.categoryId,
      brandId: spu.brandId,
      price: values.length ? { currency, min: Math.min(...values), max: Math.max(...values) } : null,
      inStock: (availableBySpu.get(spu.id) ?? 0) > 0,
    }
  })

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

  const title = localized(spu.name, lang)
  const description = localized(spu.description, lang)
  return {
    id: spu.id,
    slug: displaySlug(spu, lang),
    title,
    description,
    cover: spu.cover,
    images: spu.images ?? [],
    category: category ? { id: category.id, name: localized(category.name, lang) } : null,
    brand: brand ? { id: brand.id, name: brand.name } : null,
    currency: effectiveCurrency,
    price: priceValues.length ? { min: Math.min(...priceValues), max: Math.max(...priceValues) } : null,
    variants,
    seo: { title, description: description.slice(0, 160) },
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
