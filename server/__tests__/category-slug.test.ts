// @vitest-environment node
/**
 * 类目 slug 生成（PLAN 2.5）
 *
 * 背景：`categories` 表只有多语言 name，没有 slug。BFF 过去用 `c-<id>` 充当 slug，
 * 导致 `pages/c/[slug].vue` 的 CATEGORY_SEO（以 'lace-wigs' 为键）永不命中，
 * 与 docs/SEO_SPEC.md 规定的 `/c/:slug` 冲突。
 *
 * 这里锁定纯函数口径（与迁移 000001/000002 的 SQL 回填保持一致）：
 * - 英文名 → kebab；
 * - 纯中文无法转 ASCII → 空串，调用方回退 `category-<id>`；
 * - 名称优先 en-US。
 */
import { describe, expect, it } from 'vitest'
import { pickDisplayName, toKebabCase } from '../modules/shop/services/categorySlugService.js'

describe('toKebabCase', () => {
  it('turns a human category name into a URL segment', () => {
    expect(toKebabCase('Lace Wigs')).toBe('lace-wigs')
    expect(toKebabCase('HD Lace')).toBe('hd-lace')
    expect(toKebabCase('Body Wave')).toBe('body-wave')
  })

  it('collapses separators and punctuation into single hyphens', () => {
    expect(toKebabCase('Full Lace / Wigs')).toBe('full-lace-wigs')
    expect(toKebabCase('  Trimmed  Name  ')).toBe('trimmed-name')
    expect(toKebabCase('Human Hair 100%')).toBe('human-hair-100')
  })

  it('returns an empty string for names without ASCII letters or digits', () => {
    // 调用方需回退 category-<id>；返回空串而不是抛错，保持"能建类目"优先
    expect(toKebabCase('前台类目')).toBe('')
    expect(toKebabCase('★ ★')).toBe('')
  })

  it('caps the slug length', () => {
    expect(toKebabCase('a'.repeat(200)).length).toBe(60)
  })
})

describe('pickDisplayName', () => {
  it('prefers en-US over zh-CN', () => {
    expect(pickDisplayName({ 'zh-CN': '前台类目', 'en-US': 'Storefront Category' })).toBe('Storefront Category')
  })

  it('falls back to zh-CN then the first value', () => {
    expect(pickDisplayName({ 'zh-CN': '类目' })).toBe('类目')
    expect(pickDisplayName({ fr: 'Catégorie' })).toBe('Catégorie')
  })

  it('handles plain strings and empty input', () => {
    expect(pickDisplayName('Lace Wigs')).toBe('Lace Wigs')
    expect(pickDisplayName(null)).toBe('')
    expect(pickDisplayName(undefined)).toBe('')
  })

  it('produces a slug matching the CATEGORY_SEO keys for English names', () => {
    // 这两个 key 必须能在 pages/c/[slug].vue 的 CATEGORY_SEO 中命中
    expect(toKebabCase(pickDisplayName({ 'en-US': 'Lace Wigs' }))).toBe('lace-wigs')
    expect(toKebabCase(pickDisplayName({ 'en-US': 'HD Lace' }))).toBe('hd-lace')
  })
})
