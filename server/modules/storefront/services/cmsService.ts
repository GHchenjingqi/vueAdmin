import { Op, Sequelize } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopArticle } from '../../shop/models/index.js'
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

/** 公开文章详情：仅 published，按站点隔离；不存在/未发布 → 404 */
export async function getArticleBySlug(site: StorefrontSite, slug: string): Promise<ArticleDetail> {
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
  const row = await ShopArticle.create({
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
  return { id: row.id }
}
