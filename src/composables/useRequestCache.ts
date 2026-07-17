/**
 * 请求缓存与去重策略
 *
 * - 相同 key 的并发请求合并为一次，避免重复请求
 * - 缓存有效期内直接返回缓存数据，减少网络开销
 * - 支持手动清除缓存
 */
import { ref, type Ref } from 'vue'

interface CacheEntry<T = unknown> {
  data: T
  expiry: number
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

const cache = new Map<string, CacheEntry>()
const pendingRequests = new Map<string, PendingRequest[]>()

/** 默认缓存时间 30 秒 */
const DEFAULT_TTL = 30_000

/** 缓存最大条目数，超出后 LRU 淘汰 */
const MAX_CACHE_SIZE = 100

/**
 * 清除过期的缓存条目
 */
function cleanExpired(): void {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now > entry.expiry) {
      cache.delete(key)
    }
  }
}

/**
 * 按 LRU 策略淘汰最旧的缓存条目
 */
function evictLRU(): void {
  if (cache.size <= MAX_CACHE_SIZE) return
  const firstKey = cache.keys().next().value
  if (firstKey) cache.delete(firstKey)
}

/**
 * 请求缓存组合式函数
 *
 * @param key - 缓存键，相同时共享缓存
 * @param fetcher - 请求函数
 * @param ttl - 缓存有效期（毫秒），默认 30 秒
 * @returns { data, loading, error, execute, clearCache }
 */
export function useCachedRequest<T>(key: string, fetcher: () => Promise<T>, ttl: number = DEFAULT_TTL) {
  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * 执行请求（带缓存和去重）
   */
  async function execute(forceRefresh = false): Promise<T | null> {
    cleanExpired()

    if (!forceRefresh) {
      const cached = cache.get(key)
      if (cached && Date.now() <= cached.expiry) {
        data.value = cached.data as T
        return cached.data as T
      }
    }

    if (pendingRequests.has(key)) {
      return new Promise<T>((resolve, reject) => {
        pendingRequests.get(key)!.push({
          resolve: resolve as (value: unknown) => void,
          reject,
        })
      })
    }

    pendingRequests.set(key, [])
    loading.value = true
    error.value = null

    try {
      const result = await fetcher()
      data.value = result
      cache.set(key, { data: result, expiry: Date.now() + ttl })
      evictLRU()

      const queue = pendingRequests.get(key) || []
      pendingRequests.delete(key)
      for (const req of queue) {
        req.resolve(result)
      }

      return result
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '请求失败'
      error.value = msg

      const queue = pendingRequests.get(key) || []
      pendingRequests.delete(key)
      for (const req of queue) {
        req.reject(err)
      }

      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 清除指定 key 的缓存
   */
  function clearCache(): void {
    cache.delete(key)
    data.value = null
  }

  return {
    data,
    loading,
    error,
    execute,
    clearCache,
  }
}

/**
 * 清除所有缓存
 */
export function clearAllCache(): void {
  cache.clear()
  pendingRequests.clear()
}

/**
 * 按前缀清除缓存
 */
export function clearCacheByPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
    }
  }
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): { size: number; pending: number; keys: string[] } {
  return {
    size: cache.size,
    pending: pendingRequests.size,
    keys: Array.from(cache.keys()),
  }
}
