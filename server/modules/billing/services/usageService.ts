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

export function getMemoryCounters(): Map<string, number> {
  return memoryCounters
}

export function resetMemoryCounters(): void {
  memoryCounters.clear()
}