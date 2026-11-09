/**
 * 配额计量（T13）
 *
 * 三类指标，来源不同但对外同一套语义：
 * - 存量指标（users）：实时数业务表，不受计数器重置影响；
 * - 累计指标（files/storage）：只增不减、period='total'，跨重启靠 usages 表兜底；
 * - 周期指标（apiCalls/workflowRuns）：按日/月重置，Redis 为热路径，落库防重启归零。
 *
 * limit<=0 一律视为「不限额」：套餐没配该维度、或租户根本没有订阅时，
 * 不应该让 quotaGuard 把业务请求判成 402（这正是此前 users/files 全线 402 的根因）。
 */
import { getRedis } from '../../../config/redis.js'
import Usage from '../models/Usage.js'
import Subscription from '../models/Subscription.js'
import Plan from '../models/Plan.js'
import User from '../../../models/User.js'

export type QuotaMetric = 'users' | 'files' | 'storage' | 'apiCalls' | 'workflowRuns'

export const QUOTA_METRICS: QuotaMetric[] = ['users', 'files', 'storage', 'apiCalls', 'workflowRuns']

/** 指标名 → plans.limits 里的键名（DB 已按 maxUsers 等播种，改映射比改数据安全） */
const LIMIT_KEYS: Record<QuotaMetric, string> = {
  users: 'maxUsers',
  files: 'maxFiles',
  storage: 'maxStorageMb',
  apiCalls: 'maxApiCallsPerDay',
  workflowRuns: 'maxWorkflowRunsPerMonth',
}

const PERIODS: Record<QuotaMetric, 'day' | 'month' | 'total'> = {
  users: 'total',
  files: 'total',
  storage: 'total',
  apiCalls: 'day',
  workflowRuns: 'month',
}

/** 存量指标由业务表实时统计，不读写计数器 */
const LIVE_METRICS: QuotaMetric[] = ['users']

const memoryCounters = new Map<string, number>()

function isQuotaMetric(metric: string): metric is QuotaMetric {
  return (QUOTA_METRICS as string[]).includes(metric)
}

function periodKey(metric: QuotaMetric): string {
  const now = new Date()
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  if (PERIODS[metric] === 'day') return `${yyyymm}${String(now.getDate()).padStart(2, '0')}`
  if (PERIODS[metric] === 'month') return yyyymm
  return 'total'
}

function redisKey(tenantId: number, metric: QuotaMetric): string {
  return `usage:${tenantId}:${metric}:${periodKey(metric)}`
}

function memoryKey(tenantId: number, metric: QuotaMetric): string {
  return `${tenantId}:${metric}:${periodKey(metric)}`
}

function ttlSeconds(metric: QuotaMetric): number {
  if (PERIODS[metric] === 'day') return 2 * 86400
  if (PERIODS[metric] === 'month') return 2 * 31 * 86400
  return 0
}

async function liveMetricValue(tenantId: number, metric: QuotaMetric): Promise<number> {
  if (metric === 'users') return User.count({ where: { tenantId } })
  return 0
}

export async function incrUsage(tenantId: number, metric: string, delta = 1): Promise<number> {
  if (!isQuotaMetric(metric)) throw new Error(`未注册的配额指标: ${metric}`)
  if (LIVE_METRICS.includes(metric)) return getUsage(tenantId, metric)

  let next: number
  const redis = getRedis()
  if (redis) {
    const key = redisKey(tenantId, metric)
    next = await redis.incrby(key, delta)
    const ttl = ttlSeconds(metric)
    if (ttl > 0) await redis.expire(key, ttl)
  } else {
    // 无 Redis 时以「已有值 + delta」推进，已有值可能来自 usages 表，避免进程重启后计数被清零
    next = (await getUsage(tenantId, metric)) + delta
    memoryCounters.set(memoryKey(tenantId, metric), next)
  }

  await Usage.upsert({ tenantId, metric, period: periodKey(metric), value: next })
  return next
}

export async function getUsage(tenantId: number, metric: string): Promise<number> {
  if (!isQuotaMetric(metric)) return 0
  if (LIVE_METRICS.includes(metric)) return liveMetricValue(tenantId, metric)

  const redis = getRedis()
  if (redis) {
    const val = await redis.get(redisKey(tenantId, metric))
    if (val != null) return parseInt(val, 10)
  } else {
    const cached = memoryCounters.get(memoryKey(tenantId, metric))
    if (cached != null) return cached
  }

  const row = await Usage.findOne({ where: { tenantId, metric, period: periodKey(metric) } })
  return row ? Number(row.value) : 0
}

export async function getLimit(tenantId: number, metric: string): Promise<number> {
  if (!isQuotaMetric(metric)) return 0
  const sub = await Subscription.findOne({ where: { tenantId, status: 'active' }, order: [['id', 'DESC']] })
  if (!sub) return 0
  const plan = await Plan.findByPk(sub.planId)
  const limits = (plan?.limits ?? {}) as Record<string, number>
  return Number(limits[LIMIT_KEYS[metric]] ?? 0)
}

export async function checkQuota(tenantId: number, metric: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limit = await getLimit(tenantId, metric)
  if (limit <= 0) return { allowed: true, used: await getUsage(tenantId, metric), limit: 0 }
  const used = await getUsage(tenantId, metric)
  return { allowed: used < limit, used, limit }
}

/** 配额总览：租户首页一次请求拿到全部「已用/上限」 */
export async function getQuotaSnapshot(tenantId: number) {
  const sub = await Subscription.findOne({ where: { tenantId, status: 'active' }, order: [['id', 'DESC']] })
  const plan = sub ? await Plan.findByPk(sub.planId) : null

  const metrics = await Promise.all(
    QUOTA_METRICS.map(async (metric) => ({
      metric,
      period: PERIODS[metric],
      used: await getUsage(tenantId, metric),
      limit: await getLimit(tenantId, metric),
    })),
  )

  return {
    planCode: plan?.code ?? null,
    periodEnd: sub?.currentPeriodEnd ?? null,
    metrics,
  }
}

export function getMemoryCounters(): Map<string, number> {
  return memoryCounters
}

export function resetMemoryCounters(): void {
  memoryCounters.clear()
}
