import type { Request, Response } from 'express'
import { Op } from 'sequelize'
import { getTenantContext } from '../../tenant/context.js'
import { ShopAnalyticsEvent, ShopSpu } from '../../shop/models/index.js'
import * as catalogService from './catalogService.js'
import { canonicalTerm, mergeByCanonical } from './searchSynonymsService.js'

/**
 * Storefront 搜索增强（P6 + 二期）控制器：关键词纠错建议 + 热搜词 + 无结果兜底。
 *
 * 纯读、零新表：
 * - 纠错建议：Levenshtein 距离 ≤2 在商品名词表内找最近候选；
 * - 热搜词：聚合 shop_analytics_events 里 search 事件（params.search_term）近 N 天 Top K，
 *   并按同义词表把别名归并到 canonical（二期）；
 * - 无结果兜底：该词确实 0 结果时，回退同分类或全站热门商品。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

function titleFromName(name: unknown): string {
  if (typeof name === 'string') return name
  if (name && typeof name === 'object') {
    const obj = name as Record<string, unknown>
    return String(obj['en-US'] ?? obj.en ?? Object.values(obj)[0] ?? '')
  }
  return ''
}

function buildVocab(names: string[]): string[] {
  const set = new Set<string>()
  for (const n of names) {
    for (const token of n.split(/[\s\-–—/,.·()（）,;:"']+/)) {
      const t = token.toLowerCase().trim()
      if (t.length >= 3 && !/^\d+$/.test(t)) set.add(t)
    }
  }
  return [...set]
}

export async function suggest(req: Request, res: Response): Promise<void> {
  const term = String(req.query.q ?? '').trim().toLowerCase()
  const limit = Math.min(Math.max(1, Number(req.query.limit ?? 5) || 5), 10)
  const maxDistance = 2

  if (term.length < 2) {
    res.json({ code: 0, data: { query: term, suggestions: [] } })
    return
  }

  const spus = await ShopSpu.findAll({
    where: { tenantId: tid(), status: { [Op.in]: ['listed', 'published'] } },
    attributes: ['id', 'name'],
    limit: 500,
    order: [['id', 'DESC']],
    raw: true,
  })
  const names = spus.map((s) => titleFromName(s.name))
  const vocab = buildVocab(names)

  const scored: { word: string; dist: number }[] = []
  for (const word of vocab) {
    const dist = levenshtein(term, word)
    if (dist <= maxDistance) scored.push({ word, dist })
  }
  scored.sort((a, b) => a.dist - b.dist || a.word.localeCompare(b.word))

  res.json({
    code: 0,
    data: { query: term, suggestions: scored.slice(0, limit).map((s) => s.word) },
  })
}

export async function hotKeywords(req: Request, res: Response): Promise<void> {
  const days = Math.min(Math.max(1, Number(req.query.days ?? 7) || 7), 90)
  const limit = Math.min(Math.max(1, Number(req.query.limit ?? 10) || 10), 50)
  const tId = tid()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const events = await ShopAnalyticsEvent.findAll({
    where: { tenantId: tId, eventName: 'search', createdAt: { [Op.gte]: since } },
    order: [['createdAt', 'DESC']],
    limit: 20000,
    attributes: ['params'],
  })

  const counts = new Map<string, number>()
  for (const ev of events) {
    const p = ev.params as Record<string, unknown> | null
    const term = typeof p?.search_term === 'string' ? (p.search_term as string).trim().toLowerCase() : ''
    if (!term) continue
    counts.set(term, (counts.get(term) ?? 0) + 1)
  }

  // 二期：别名归并到 canonical（bodywave→body wave 等），避免同义热词分散排名
  const merged = mergeByCanonical(counts.entries())

  const keywords = [...merged.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }))

  res.json({ code: 0, data: { keywords, days } })
}

export async function fallbackForNoResults(req: Request, res: Response): Promise<void> {
  const limit = Math.min(Math.max(1, Number(req.query.limit ?? 8) || 8), 24)
  const term = String(req.query.q ?? '').trim().toLowerCase()
  const opts = { currency: req.query.currency as string | undefined, lang: req.query.lang as string | undefined }

  if (term) {
    const { total } = await catalogService.listProducts({ keyword: term, pageSize: 1 }, opts)
    if (total > 0) {
      res.json({ code: 0, data: { items: [], strategy: "none" } })
      return
    }
  }

  const { list } = await catalogService.listProducts({ page: 1, pageSize: limit }, opts)
  if (list.length) {
    res.json({ code: 0, data: { items: list, strategy: "hot" } })
  } else {
    res.json({ code: 0, data: { items: [], strategy: "none" } })
  }
}
