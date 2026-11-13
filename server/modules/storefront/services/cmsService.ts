import { Op, Sequelize, UniqueConstraintError } from 'sequelize'
import DOMPurify from 'isomorphic-dompurify'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopArticle } from '../../shop/models/index.js'
import * as auditLogService from '../../shop/services/auditLogService.js'
import * as cmsCache from './cmsCacheService.js'
import type { ArticleChangeEvent } from './cmsCacheService.js'
import type { StorefrontSite } from '../middleware/siteContext.js'

/**
 * 内容管理服务（阶段 5 步骤 5 / 第三切片：CMS）
 *
 * 复用 shop 模型层（shop_articles），不复制数据、不建第二套后端。
 * 公开接口免 admin 鉴权，内容按 tenantId + siteId（shops.id）隔离。
 * 公开读取仅返回 status='published' 的文章；草稿/未发布不可见。
 * 写入（createArticle）供测试与未来 admin 模块调用，admin 路由不在本步范围。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

/** 列表查询输入 */
export interface ArticleListQuery {
  page?: number
  pageSize?: number
  tag?: string
  keyword?: string
}

export interface ArticleSummary {
  id: number
  title: string
  slug: string
  summary: string | null
  coverImage: string | null
  authorName: string | null
  tags: string[] | null
  publishedAt: Date | null
}

export interface ArticleDetail extends ArticleSummary {
  content: string
  /** 文章自身更新时间（详情 ETag 因子，编辑后缓存立即失效） */
  updatedAt: Date
  /** schema.org/BlogPosting 结构化数据，前端可直接注入 <script type="application/ld+json"> */
  structuredData: Record<string, unknown>
}

export interface ArticleListView {
  items: ArticleSummary[]
  total: number
  page: number
  pageSize: number
}

/** 公开文章列表：仅 published，按 site 隔离，publishedAt 倒序（sortOrder 权重在前） */
export async function listArticles(site: StorefrontSite, q: ArticleListQuery): Promise<ArticleListView> {
  const tId = tid()
  const siteId = site.shopId ?? 0
  const where: Record<string | symbol, unknown> = { tenantId: tId, siteId, status: 'published' as const }
  if (q.keyword) where.title = { [Op.like]: `%${q.keyword}%` }
  // MySQL 不支持 Op.contains（→ PG @>）；用参数化 JSON_CONTAINS 做标签过滤，防注入
  const replacements: Record<string, unknown> = {}
  if (q.tag) {
    // Op.and 为 unique symbol，需用 symbol 索引签名绕过 Record<string,unknown> 的限制
    ;(where as Record<string | symbol, unknown>)[Op.and] = Sequelize.literal('JSON_CONTAINS(tags, :tag)')
    replacements.tag = JSON.stringify(q.tag)
  }

  const page = q.page && q.page > 0 ? q.page : 1
  const pageSize = Math.min(q.pageSize && q.pageSize > 0 ? q.pageSize : 10, 60)

  const { rows, count } = await ShopArticle.findAndCountAll({
    where,
    replacements,
    attributes: ['id', 'title', 'slug', 'summary', 'coverImage', 'authorName', 'tags', 'publishedAt'],
    order: [
      ['publishedAt', 'DESC'],
      ['sortOrder', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })

  const items: ArticleSummary[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    summary: r.summary,
    coverImage: r.coverImage,
    authorName: r.authorName,
    tags: (r.tags as string[] | null) ?? null,
    publishedAt: r.publishedAt,
  }))
  return { items, total: count, page, pageSize }
}

/** 生成 schema.org/BlogPosting（P5-T06 结构化数据）；baseUrl 缺省时用相对路径，避免伪造域名 */
export function buildArticleJsonLd(row: ShopArticle, baseUrl = ''): Record<string, unknown> {
  const url = `${baseUrl.replace(/\/$/, '')}/blog/${row.slug}`
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: row.title,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
  if (row.summary) ld.description = row.summary
  if (row.coverImage) ld.image = [row.coverImage]
  if (row.authorName) ld.author = { '@type': 'Person', name: row.authorName }
  if (row.publishedAt) ld.datePublished = new Date(row.publishedAt).toISOString()
  if (row.updatedAt) ld.dateModified = new Date(row.updatedAt).toISOString()
  const tags = (row.tags as string[] | null) ?? null
  if (tags?.length) ld.keywords = tags.join(', ')
  return ld
}

/** 公开文章详情：仅 published，按站点隔离；不存在/未发布 → 404 */
export async function getArticleBySlug(site: StorefrontSite, slug: string, baseUrl = ''): Promise<ArticleDetail> {
  const tId = tid()
  const siteId = site.shopId ?? 0
  const row = await ShopArticle.findOne({ where: { tenantId: tId, siteId, slug, status: 'published' } })
  if (!row) throw new AppError(404, '文章不存在或未发布')
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    coverImage: row.coverImage,
    authorName: row.authorName,
    tags: (row.tags as string[] | null) ?? null,
    publishedAt: row.publishedAt,
    content: row.content,
    updatedAt: row.updatedAt,
    structuredData: buildArticleJsonLd(row, baseUrl),
  }
}

/** 创建文章（供测试 / 未来 admin 写入；公开接口不暴露本方法） */
export interface ArticleCreateInput {
  title: string
  slug: string
  content: string
  summary?: string | null
  coverImage?: string | null
  authorName?: string | null
  tags?: string[] | null
  status?: 'draft' | 'published'
  publishedAt?: Date | null
  sortOrder?: number
}

export async function createArticle(site: StorefrontSite, input: ArticleCreateInput): Promise<{ id: number }> {
  const tId = tid()
  const siteId = site.shopId ?? 0
  const isPublished = input.status === 'published'
  let row: ShopArticle
  try {
    row = await ShopArticle.create({
      tenantId: tId,
      siteId,
      title: input.title,
      slug: input.slug,
      content: input.content,
      summary: input.summary ?? null,
      coverImage: input.coverImage ?? null,
      authorName: input.authorName ?? null,
      tags: input.tags ?? null,
      status: input.status ?? 'draft',
      publishedAt: isPublished ? (input.publishedAt ?? new Date()) : null,
      sortOrder: input.sortOrder ?? 0,
    } as never)
  } catch (err) {
    rethrowSlugConflict(err)
  }
  await changed(site, row.slug, isPublished ? 'published' : 'created')
  await auditArticle(isPublished ? 'published' : 'created', row.id, null, snapshot(row))
  return { id: row.id }
}

// ==================== 后台写入（P5-T06：发布 / 下线 / 编辑均触发缓存失效） ====================

export interface ArticleUpdateInput {
  title?: string
  slug?: string
  content?: string
  summary?: string | null
  coverImage?: string | null
  authorName?: string | null
  tags?: string[] | null
  sortOrder?: number
}

function snapshot(row: ShopArticle): Record<string, unknown> {
  return {
    title: row.title,
    slug: row.slug,
    status: row.status,
    publishedAt: row.publishedAt,
    sortOrder: row.sortOrder,
  }
}

/** 唯一索引 uniq_articles_tenant_site_slug 冲突 → 409，避免把 Sequelize 原始错误暴露给后台 */
function rethrowSlugConflict(err: unknown): never {
  if (err instanceof UniqueConstraintError) throw new AppError(409, '文章 slug 已存在')
  throw err
}

async function changed(site: StorefrontSite, slug: string, action: ArticleChangeEvent['action']): Promise<void> {
  await cmsCache.notifyArticleChanged({ tenantId: tid(), siteId: site.shopId ?? 0, slug, action })
}

/** 文章状态变更写 X-T03 通用审计；写入失败仅告警不阻断发布 */
async function auditArticle(
  action: string,
  entityId: number,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<void> {
  await auditLogService.record({
    actorType: 'admin',
    action: `article.${action}`,
    entityType: 'article',
    entityId,
    beforeState: before,
    afterState: after,
  })
}

async function findAdminArticle(site: StorefrontSite, id: number): Promise<ShopArticle> {
  const row = await ShopArticle.findOne({ where: { tenantId: tid(), siteId: site.shopId ?? 0, id } })
  if (!row) throw new AppError(404, '文章不存在')
  return row
}

/** 后台详情：编辑弹窗需回填正文等完整字段，列表接口只投影摘要字段 */
export async function getAdminArticle(site: StorefrontSite, id: number): Promise<ShopArticle> {
  return findAdminArticle(site, id)
}

/** 后台列表：含草稿，id 倒序分页 */
export async function listAllArticles(
  site: StorefrontSite,
  q: { status?: string; page?: number; pageSize?: number },
): Promise<{ rows: ShopArticle[]; total: number; page: number; pageSize: number }> {
  const where: Record<string, unknown> = { tenantId: tid(), siteId: site.shopId ?? 0 }
  if (q.status) where.status = q.status
  const page = q.page && q.page > 0 ? q.page : 1
  const pageSize = Math.min(q.pageSize && q.pageSize > 0 ? q.pageSize : 20, 60)
  const { rows, count } = await ShopArticle.findAndCountAll({
    where,
    attributes: ['id', 'title', 'slug', 'status', 'publishedAt', 'sortOrder', 'createdAt', 'updatedAt'],
    order: [['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
  return { rows, total: count, page, pageSize }
}

/** 编辑内容；slug 变更同样触发缓存失效（旧列表 ETag 与详情页均需更新） */
export async function updateArticle(
  site: StorefrontSite,
  id: number,
  patch: ArticleUpdateInput,
): Promise<{ id: number; slug: string }> {
  const row = await findAdminArticle(site, id)
  const before = snapshot(row)
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  try {
    await row.update(clean as never)
  } catch (err) {
    rethrowSlugConflict(err)
  }
  await changed(site, row.slug, 'updated')
  await auditArticle('updated', id, before, snapshot(row))
  return { id: row.id, slug: row.slug }
}

/** 发布：draft → published（首次发布写 publishedAt；重新发布沿用原发布时间） */
export async function publishArticle(
  site: StorefrontSite,
  id: number,
): Promise<{ id: number; status: 'published'; changed: boolean }> {
  const row = await findAdminArticle(site, id)
  if (row.status === 'published') return { id: row.id, status: 'published', changed: false }
  const before = snapshot(row)
  await row.update({ status: 'published', publishedAt: row.publishedAt ?? new Date() } as never)
  await changed(site, row.slug, 'published')
  await auditArticle('published', id, before, snapshot(row))
  return { id: row.id, status: 'published', changed: true }
}

/** 下线：published → draft（公开接口随即 404；publishedAt 保留供重新发布） */
export async function unpublishArticle(
  site: StorefrontSite,
  id: number,
): Promise<{ id: number; status: 'draft'; changed: boolean }> {
  const row = await findAdminArticle(site, id)
  if (row.status === 'draft') return { id: row.id, status: 'draft', changed: false }
  const before = snapshot(row)
  await row.update({ status: 'draft' } as never)
  await changed(site, row.slug, 'unpublished')
  await auditArticle('unpublished', id, before, snapshot(row))
  return { id: row.id, status: 'draft', changed: true }
}

// ==================== FAQ（复用 shop_articles 表，tags 含 'faq'） ====================
// C-FAQ 需求：零新表——把 FAQ 作为文章的一种，tags 内含 'faq' 标记。
// 结构映射：title=问题，content=答案（富文本），summary=可选简短答案（列表折叠显示），
// category 复用 tags（除 'faq' 外的第一个 tag 即分类，如 'faq:shipping'），sortOrder 控制顺序。

/** FAQ 固定标记 tag；写入时由调用方保证存在，读取时按此过滤 */
export const FAQ_TAG = 'faq'

export interface FaqItem {
  id: number
  /** 问题 */
  question: string
  /** 答案（富文本 HTML） */
  answer: string
  /** 可选简短答案（列表折叠态展示，无则前端截断 answer） */
  shortAnswer: string | null
  /** 分类（除 faq 外的第一个 tag；无则 null） */
  category: string | null
  slug: string
  sortOrder: number
  updatedAt: Date
}

function faqCategoryOf(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null
  const rest = (tags as string[]).filter((tg) => tg !== FAQ_TAG)
  return rest.length ? rest[0] : null
}

function toFaqItem(row: ShopArticle, withAnswer: boolean): FaqItem {
  return {
    id: row.id,
    question: row.title,
    answer: withAnswer ? sanitizeFaqAnswer(row.content) : '',
    shortAnswer: row.summary,
    category: faqCategoryOf(row.tags),
    slug: row.slug,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt,
  }
}

/**
 * 净化 FAQ 富文本答案：保留安全格式标签（p/br/strong/em/ul/ol/li/a/img 等），
 * 剥离 script / 事件属性 / javascript: 协议，防止存储型 XSS 注入公开 FAQ 页面。
 * FAQ 答案经 C 端 v-html 渲染给所有公开访客，必须由服务端在输出边界净化一次。
 */
function sanitizeFaqAnswer(html: string | null | undefined): string {
  if (!html) return ''
  return DOMPurify.sanitize(html)
}

export interface FaqListQuery {
  category?: string
  keyword?: string
}

/** 公开 FAQ 列表：tags 含 'faq' 且 published，按 sortOrder 升序（同序按 id 倒序） */
export async function listFaqs(
  site: StorefrontSite,
  q: FaqListQuery = {},
): Promise<{ items: FaqItem[]; categories: string[] }> {
  const tId = tid()
  const siteId = site.shopId ?? 0
  const where: Record<string | symbol, unknown> = { tenantId: tId, siteId, status: 'published' as const }
  const replacements: Record<string, unknown> = {}
  ;(where as Record<string | symbol, unknown>)[Op.and] = Sequelize.literal('JSON_CONTAINS(tags, :faqTag)')
  replacements.faqTag = JSON.stringify(FAQ_TAG)
  if (q.keyword) where.title = { [Op.like]: `%${q.keyword}%` }

  const rows = await ShopArticle.findAll({
    where,
    replacements,
    attributes: ['id', 'title', 'slug', 'summary', 'tags', 'sortOrder', 'updatedAt', 'content'],
    order: [
      ['sortOrder', 'ASC'],
      ['id', 'DESC'],
    ],
    limit: 200,
  })

  // 分类聚合：按出现顺序去重；category 过滤在内存完成（tag 组合查询复杂度不值当）
  const seen: string[] = []
  let items = rows.map((r) => toFaqItem(r, true))
  for (const it of items) {
    if (it.category && !seen.includes(it.category)) seen.push(it.category)
  }
  if (q.category) items = items.filter((it) => it.category === q.category)
  return { items, categories: seen }
}

/** 公开 FAQ 详情：仅 published + 含 faq 标记；否则 404 */
export async function getFaqBySlug(site: StorefrontSite, slug: string): Promise<FaqItem> {
  const tId = tid()
  const siteId = site.shopId ?? 0
  const row = await ShopArticle.findOne({ where: { tenantId: tId, siteId, slug, status: 'published' } })
  if (!row) throw new AppError(404, 'FAQ 不存在或未发布')
  const tags = (row.tags as string[] | null) ?? []
  if (!tags.includes(FAQ_TAG)) throw new AppError(404, 'FAQ 不存在')
  return toFaqItem(row, true)
}
