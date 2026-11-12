import { describe, it, expect } from 'vitest'
import { canonicalTerm, expandTerm, mergeByCanonical, SYNONYM_GROUPS } from '../modules/storefront/services/searchSynonymsService.js'

/**
 * 同义词/别名归一化单测（搜索增强二期）：
 * - canonicalTerm：别名→组代表词；未收录→归一化自身；空→空
 * - expandTerm：展开该组全部别名；未收录→[自身]
 * - mergeByCanonical：别名计数归并到 canonical
 * - 归一化：大小写、多空格折叠
 */

describe('searchSynonymsService · 同义词归一化', () => {
  it('canonicalTerm 把别名归一到组代表词', () => {
    expect(canonicalTerm('bodywave')).toBe('body wave')
    expect(canonicalTerm('BODY WAVE')).toBe('body wave')
    expect(canonicalTerm('hairpiece')).toBe('wig')
    expect(canonicalTerm('  glueless  wig  ')).toBe('glueless')
  })

  it('canonicalTerm 未收录词返回归一化自身，空返回空', () => {
    expect(canonicalTerm('someunknownword')).toBe('someunknownword')
    expect(canonicalTerm('')).toBe('')
    expect(canonicalTerm('   ')).toBe('')
  })

  it('expandTerm 展开该组全部别名（含自身/canonical）', () => {
    const out = expandTerm('waterwave')
    expect(out).toContain('water wave')
    expect(out).toContain('waterwave')
    expect(out).toContain('water wavy')
    // 组内每个别名都归一化出现
    for (const alias of SYNONYM_GROUPS.find((g) => g[0] === 'water wave')!) {
      expect(out).toContain(alias.toLowerCase())
    }
  })

  it('expandTerm 未收录词返回单元素数组', () => {
    expect(expandTerm('zzz')).toEqual(['zzz'])
    expect(expandTerm('')).toEqual([])
  })

  it('mergeByCanonical 把同义别名计数相加', () => {
    const counts: [string, number][] = [
      ['body wave', 5],
      ['bodywave', 3],
      ['body wavy', 2],
      ['wig', 10],
      ['hairpiece', 4],
    ]
    const merged = mergeByCanonical(counts)
    expect(merged.get('body wave')).toBe(10)
    expect(merged.get('wig')).toBe(14)
    expect(merged.has('bodywave')).toBe(false)
  })

  it("多空格折叠：glue-less / no glue 与 glueless 同组归并", () => {
    const merged = mergeByCanonical([
      ['glueless', 2],
      ['glueless wig', 1],
      ['no glue', 1],
    ])
    expect(merged.get('glueless')).toBe(4)
  })
})
