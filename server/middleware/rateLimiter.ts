/**
 * 登录频率限制中间件
 *
 * 设计要点：
 * - 策略模式：Redis 可用 => Redis 限流；否则 => 内存限流
 * - 所有公共方法均为 async，适配异步存储后端
 * - 通过 setStore() 注入 Mock，方便单元测试
 */

import { getRedis } from '../config/redis.js'
import { MemoryRateLimitStore, RedisRateLimitStore, type CheckResult, type RateLimitStore } from './rateLimitStore.js'

const WINDOW_MS = 15 * 60 * 1000 // 15 分钟窗口
const MAX_ATTEMPTS = 5 // 窗口内最大失败次数

// 策略选择：Redis 可用 => Redis；否则 => 内存
let store: RateLimitStore
const redis = getRedis()
if (redis) {
  store = new RedisRateLimitStore(redis)
  console.log('[rateLimiter] 使用 Redis 存储（多实例模式）')
} else {
  store = new MemoryRateLimitStore()
  console.log('[rateLimiter] 使用内存存储（单实例模式）')
}

/**
 * 生成限流键（IP + 用户名）
 */
function getKey(ip: string, username: string): string {
  return `rate:login:${ip}:${username}`
}

/**
 * 注入自定义 Store（仅用于测试）
 */
export function setStore(customStore: RateLimitStore) {
  store = customStore
}

/**
 * 检查是否超出限流
 */
export async function checkRateLimit(ip: string, username: string) {
  const key = getKey(ip, username)
  return store.check(key, WINDOW_MS, MAX_ATTEMPTS)
}

/**
 * 记录登录失败次数
 */
export async function recordAttempt(ip: string, username: string) {
  const key = getKey(ip, username)
  await store.record(key, WINDOW_MS)
}

/**
 * 清除登录失败记录（登录成功后调用）
 */
export async function clearAttempts(ip: string, username: string) {
  const key = getKey(ip, username)
  await store.clear(key)
}

/**
 * 通用按键限流（非登录场景，如后台支付凭据读写）：每次调用先检查、放行则计数。
 * 与登录限流共用同一 Redis/内存 store，多实例部署下共享计数。
 */
export async function checkKeyedRateLimit(key: string, windowMs: number, maxAttempts: number): Promise<CheckResult> {
  const result = await store.check(key, windowMs, maxAttempts)
  if (result.allowed) await store.record(key, windowMs)
  return result
}

/**
 * 通用按键「失败计数」限流：check 只读不计数，需显式调用 recordKeyedAttempt 记失败。
 *
 * 用于「只有失败才计数」的场景（如 C 端顾客登录：成功登录不应占用额度），
 * 与 checkKeyedRateLimit（每次调用即计数）语义区分。
 */
export async function checkKeyedAttempts(key: string, windowMs: number, maxAttempts: number): Promise<CheckResult> {
  return store.check(key, windowMs, maxAttempts)
}

/** 记一次失败（配合 checkKeyedAttempts 使用） */
export async function recordKeyedAttempt(key: string, windowMs: number): Promise<void> {
  await store.record(key, windowMs)
}

/** 清除失败计数（成功后调用） */
export async function clearKeyedAttempts(key: string): Promise<void> {
  await store.clear(key)
}
