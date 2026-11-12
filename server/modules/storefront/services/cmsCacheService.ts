/**
 * CMS 缓存治理（P5-T06：发布触发缓存失效）
 *
 * 机制分两层，均由「写操作」驱动，读路径零成本：
 * 1) 站点级 revision：任意文章的创建/编辑/发布/下线都会 +1，列表 ETag 随之变化，
 *    因此 CDN / 浏览器缓存的旧列表在发布后必然失效（无需逐条列举被影响的 URL）。
 * 2) 可插拔失效器：registerArticleCacheInvalidator() 供 CDN / Nuxt ISR 接线，
 *    收到 { tenantId, siteId, slug, action } 精确清理；未注册时退化为纯 ETag 机制。
 *
 * 失效器失败只告警不阻断内容发布（与 X-T03 审计日志同一副作用契约）。
 * revision 存进程内：多实例部署时应由外部失效器负责跨节点清理，本模块只保证本节点 ETag 正确。
 */

export interface ArticleChangeEvent {
  tenantId: number
  siteId: number
  slug: string
  action: 'created' | 'updated' | 'published' | 'unpublished'
}

export type ArticleCacheInvalidator = (event: ArticleChangeEvent) => void | Promise<void>

let invalidator: ArticleCacheInvalidator | null = null
const revisions = new Map<string, number>()

const scopeKey = (tenantId: number, siteId: number): string => `${tenantId}:${siteId}`

/** 注册外部缓存失效器（CDN / Nuxt ISR）；传 null 注销 */
export function registerArticleCacheInvalidator(fn: ArticleCacheInvalidator | null): void {
  invalidator = fn
}

/** 当前站点文章版本号（未发生写操作时为 0） */
export function getArticleRevision(tenantId: number, siteId: number): number {
  return revisions.get(scopeKey(tenantId, siteId)) ?? 0
}

/** 仅供测试重置：清空版本号与失效器，避免跨用例污染 */
export function resetArticleCacheForTests(): void {
  revisions.clear()
  invalidator = null
}

/** 文章写操作后调用：先 bump 版本号，再通知外部失效器（失败仅告警） */
export async function notifyArticleChanged(event: ArticleChangeEvent): Promise<void> {
  const key = scopeKey(event.tenantId, event.siteId)
  revisions.set(key, getArticleRevision(event.tenantId, event.siteId) + 1)
  if (!invalidator) return
  try {
    await invalidator(event)
  } catch (err) {
    console.warn(`[cms-cache] 缓存失效通知失败（不阻断发布）: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** FNV-1a 32 位：把 ETag 因子压成短十六进制串，避免把 tag/keyword 原样回显到响应头 */
function hash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** 列表 ETag：站点 revision 覆盖所有文章写操作，任一发布/下线都会使其变化 */
export function articleListEtag(
  tenantId: number,
  siteId: number,
  q: { page?: number; pageSize?: number; tag?: string; keyword?: string } = {},
): string {
  const factors = [tenantId, siteId, getArticleRevision(tenantId, siteId), q.page ?? 1, q.pageSize ?? 10, q.tag ?? '', q.keyword ?? '']
  return `"articles-${hash(factors.join('|'))}"`
}

/**
 * 详情 ETag：revision + slug + 文章自身更新时间（编辑同一篇也会失效）。
 * baseUrl 来自请求 Host / X-Forwarded-Proto，决定 structuredData 里的绝对 URL；
 * 不纳入因子会让不同域名共用同一校验器，跨域名 If-None-Match 可能 304 串内容。
 */
export function articleDetailEtag(tenantId: number, siteId: number, slug: string, updatedAt: Date | null, baseUrl = ''): string {
  const stamp = updatedAt ? updatedAt.getTime() : 0
  const factors = [tenantId, siteId, getArticleRevision(tenantId, siteId), slug, stamp, baseUrl]
  return `"article-${hash(factors.join('|'))}"`
}

/** If-None-Match 精确匹配（支持逗号分隔的多个候选值；不做弱比较） */
export function etagMatches(header: unknown, etag: string): boolean {
  if (typeof header !== 'string' || header.trim() === '') return false
  return header
    .split(',')
    .map((v) => v.trim())
    .includes(etag)
}

// ————— FAQ（复用 shop_articles 表，tags 含 'faq'；沿用站点 revision） —————

/** FAQ 列表 ETag：与文章列表共用 revision，FAQ 增删改发布/下线均触发变化 */
export function faqListEtag(
  tenantId: number,
  siteId: number,
  q: { category?: string; keyword?: string } = {},
): string {
  const factors = [tenantId, siteId, getArticleRevision(tenantId, siteId), q.category ?? '', q.keyword ?? '']
  return `"faqs-${hash(factors.join('|'))}"`
}

/** FAQ 详情 ETag：revision + slug + 自身 updatedAt；分类下线后仍须返回 404（controller 先查库） */
export function faqDetailEtag(tenantId: number, siteId: number, slug: string, updatedAt: Date | null): string {
  const stamp = updatedAt ? updatedAt.getTime() : 0
  const factors = [tenantId, siteId, getArticleRevision(tenantId, siteId), slug, stamp]
  return `"faq-${hash(factors.join('|'))}"`
}
