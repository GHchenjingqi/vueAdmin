/**
 * 登录频率限制中间件
 *
 * 设计要点：
 * - 策略模式：Redis 可用 => Redis 限流；否则 => 内存限流
 * - 所有公共方法均为 async，适配异步存储后端
 * - 通过 setStore() 注入 Mock，方便单元测试
 */

import { getRedis } from '../config/redis.js'
import { MemoryRateLimitStore, RedisRateLimitStore, type RateLimitStore } from './rateLimitStore.js'

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