import { describe, expect, it } from 'vitest'
import { buildCollectionPaginationLinks } from '../../shared/seo/pagination'

/**
 * P0-T16 / SEO_SPEC §2：集合页分页 canonical 自指 + rel=prev/next。
 * - 第 1 页：canonical 去参数（'' → 回落到 path 无参数 URL），无 prev，有 next。
 * - 第 2 页：canonical 自指 ?page=2，prev 指无参数 URL，next 指向第 3 页。
 * - 中间页/末页：canonical 自指，prev/next 边界正确。
 */
describe('collection pagination SEO links (SEO_SPEC §2)', () => {
  it('page 1: canonical empty (falls back to clean path), no prev, next to page 2', () => {
    const out = buildCollectionPaginationLinks({ basePath: '/c/lace-wigs', page: 1, totalPages: 3 })
    expect(out).toEqual({ canonicalPath: '', prevHref: '', nextHref: '/c/lace-wigs?page=2' })
  })

  it('page 2: canonical self-references ?page=2, prev points to clean URL, next to page 3', () => {
    const out = buildCollectionPaginationLinks({ basePath: '/c/lace-wigs', page: 2, totalPages: 3 })
    expect(out).toEqual({
      canonicalPath: '/c/lace-wigs?page=2',
      prevHref: '/c/lace-wigs',
      nextHref: '/c/lace-wigs?page=3',
    })
  })

  it('middle page: canonical self-references, prev/next both parameterized', () => {
    const out = buildCollectionPaginationLinks({ basePath: '/c/apparel', page: 3, totalPages: 5 })
    expect(out).toEqual({
      canonicalPath: '/c/apparel?page=3',
      prevHref: '/c/apparel?page=2',
      nextHref: '/c/apparel?page=4',
    })
  })

  it('last page: no next link', () => {
    const out = buildCollectionPaginationLinks({ basePath: '/c/dresses', page: 5, totalPages: 5 })
    expect(out).toEqual({
      canonicalPath: '/c/dresses?page=5',
      prevHref: '/c/dresses?page=4',
      nextHref: '',
    })
  })

  it('single page: canonical clean, no prev, no next', () => {
    const out = buildCollectionPaginationLinks({ basePath: '/c/full-lace', page: 1, totalPages: 1 })
    expect(out).toEqual({ canonicalPath: '', prevHref: '', nextHref: '' })
  })

  it('clamps invalid page/total to safe values (no NaN in URLs)', () => {
    const out = buildCollectionPaginationLinks({ basePath: '/c/x', page: Number.NaN, totalPages: 0 })
    expect(out).toEqual({ canonicalPath: '', prevHref: '', nextHref: '' })
    expect(JSON.stringify(out)).not.toContain('NaN')
  })
})
