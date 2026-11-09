/**
 * 集合页分页 SEO 链接（P0-T16 / SEO_SPEC §2）：
 * - 第 1 页：canonical 去参数（无参数 URL `/c/:slug`），筛选/排序参数不进 canonical。
 * - 第 2 页起：canonical 自指 `?page=N`（可索引），并输出 rel=prev/next。
 * - rel=prev 在第 2 页指向无参数 URL；第 1 页不输出 prev；末页不输出 next。
 * 纯函数，便于单测锁定与页面复用。
 */
export function buildCollectionPaginationLinks(options: {
  basePath: string
  page: number
  totalPages: number
  /** 分页以外的可索引参数（当前策略下集合页仅 page 可索引；sort/attr.* 去参数） */
}): { canonicalPath: string; prevHref: string; nextHref: string } {
  const { basePath, page, totalPages } = options
  const safePage = Math.max(1, Math.floor(page) || 1)
  const safeTotal = Math.max(1, Math.floor(totalPages) || 1)

  const canonicalPath = safePage > 1 ? `${basePath}?page=${safePage}` : ''
  const prevHref =
    safePage === 2 ? basePath : safePage > 2 ? `${basePath}?page=${safePage - 1}` : ''
  const nextHref = safePage < safeTotal ? `${basePath}?page=${safePage + 1}` : ''

  return { canonicalPath, prevHref, nextHref }
}
