import { getRedis } from '../../../config/redis.js'
import Usage from '../models/Usage.js'
import Subscription from '../models/Subscription.js'
import Plan from '../models/Plan.js'
import { Op } from 'sequelize'

const memoryCounters = new Map<string, number>()

function redisKey(tenantId: number, metric: string): string {
  const now = new Date()
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '')
  return `usage:${tenantId}:${metric}:${yyyymmdd}`
}

function todayPeriod(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

/** 配额计数键的过期时间（与按日计数窗口一致） */
const QUOTA_TTL = 86400

/**
 * 单进程内 per-key 异步互斥锁：把 read-modify-write 这段无 await 的临界区串行化，
 * 防止内存回退路径下两个并发 consumeQuota 都读到旧值后各自 +delta（lost update）。
 */
const keyLocks = new Map<string, Promise<void>>()
function acquireLock(key: string): Promise<() => void> {
  const prev = keyLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const next = new Promise<void>((resolve) => {
    release = resolve
  })
  keyLocks.set(
    key,
    prev.then(() => next),
  )
  return prev.then(() => release)
}

export async function incrUsage(tenantId: number, metric: string, delta = 1): Promise<number> {
  const redis = getRedis()
  if (redis) {
    const key = redisKey(tenantId, metric)
    const val = await redis.incrby(key, delta)
    await redis.expire(key, 86400)
    return val
  }
  const memKey = `${tenantId}:${metric}:${todayPeriod()}`
  const current = (memoryCounters.get(memKey) ?? 0) + delta
  memoryCounters.set(memKey, current)
  return current
}

export async function getUsage(tenantId: number, metric: string): Promise<number> {
  const redis = getRedis()
  if (redis) {
    const key = redisKey(tenantId, metric)
    const val = await redis.get(key)
    if (val != null) return parseInt(val, 10)
  }
  const memKey = `${tenantId}:${metric}:${todayPeriod()}`
  return memoryCounters.get(memKey) ?? 0
}

export async function getLimit(tenantId: number, metric: string): Promise<number> {
  const sub = await Subscription.findOne({ where: { tenantId, status: { [Op.ne]: 'cancelled' } }, order: [['id', 'DESC']] })
  if (!sub) return 0
  const plan = await Plan.findByPk(sub.planId)
  if (!plan) return 0
  const limits = plan.limits as Record<string, number>
  return limits[metric] ?? 0
}

export async function checkQuota(tenantId: number, metric: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limit = await getLimit(tenantId, metric)
  if (limit <= 0) return { allowed: false, used: 0, limit: 0 }
  const used = await getUsage(tenantId, metric)
  return { allowed: used < limit, used, limit }
}

/**
 * 原子「检查 + 占用」配额。把 checkQuota 的读与 incrUsage 的增合并为单步，
 * 消除 TOCTOU 并发越权（多个并发请求同时通过 checkQuota 再各自递增导致超额）。
 *
 * - Redis 路径：INCRBY 后校验；若超过上限立即 DECRBY 回退并返回 ok:false（INCRBY 本身
 *   原子，超额者各自回退自身 delta，终态计数 = 放行数，不会超上限）。
 * - 内存回退路径：用 per-key 异步锁把「读-改-写」串行化，避免并发 lost update。
 *
 * 调用方（quotaGuard / uploadController）应在动作之前调用本函数作为唯一闸门与计数；
 * 返回 ok:false 即代表已被拒（计数未增加），不应再执行业务动作。
 */
export async function consumeQuota(tenantId: number, metric: string, delta = 1): Promise<{ ok: boolean; used: number; limit: number }> {
  const limit = await getLimit(tenantId, metric)
  if (limit <= 0) return { ok: false, used: 0, limit: 0 }
  const redis = getRedis()
  if (redis) {
    const key = redisKey(tenantId, metric)
    const cur = await redis.incrby(key, delta)
    await redis.expire(key, QUOTA_TTL)
    if (cur > limit) {
      await redis.decrby(key, delta)
      return { ok: false, used: limit, limit }
    }
    return { ok: true, used: cur, limit }
  }
  const memKey = `${tenantId}:${metric}:${todayPeriod()}`
  const release = await acquireLock(memKey)
  try {
    const cur = (memoryCounters.get(memKey) ?? 0) + delta
    if (cur > limit) return { ok: false, used: limit, limit }
    memoryCounters.set(memKey, cur)
    return { ok: true, used: cur, limit }
  } finally {
    release()
  }
}

/** 释放此前 consumeQuota 占用的配额（用于请求失败需要回滚的场景） */
export async function releaseQuota(tenantId: number, metric: string, delta = 1): Promise<void> {
  const redis = getRedis()
  if (redis) {
    const key = redisKey(tenantId, metric)
    await redis.decrby(key, delta)
    await redis.expire(key, QUOTA_TTL)
    return
  }
  const memKey = `${tenantId}:${metric}:${todayPeriod()}`
  const release = await acquireLock(memKey)
  try {
    const cur = memoryCounters.get(memKey) ?? 0
    memoryCounters.set(memKey, Math.max(0, cur - delta))
  } finally {
    release()
  }
}

export function getMemoryCounters(): Map<string, number> {
  return memoryCounters
}

export function resetMemoryCounters(): void {
  memoryCounters.clear()
}
