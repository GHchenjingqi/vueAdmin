/**
 * 请求级缓存（Axios 拦截器集成）
 *
 * - GET 请求 TTL 秒内缓存，相同 URL + 参数不重复请求
 * - POST/PUT/DELETE 自动清除相关缓存
 * - LRU 淘汰策略（超过最大条目数时淘汰最久未访问的条目）
 * - URL 段索引实现精确失效
 * - 支持可选 localStorage 持久化（跨页面会话共享缓存）
 */
interface CacheEntry {
  data: unknown
  expiry: number
  /** 最后访问时间戳，用于 LRU 淘汰 */
  lastAccess: number
}

const memoryCache = new Map<string, CacheEntry>()
/** URL 段索引：segment -> Set<cacheKey> */
const urlIndex = new Map<string, Set<string>>()
const DEFAULT_TTL = 30_000
/** 缓存最大条目数 */
const MAX_CACHE_SIZE = 200

/**
 * 检查缓存是否命中，命中则返回缓存数据
 * @param key 缓存 key
 * @param useStorage 是否同时检查 localStorage 持久化缓存
 */
export function getCache(key: string, useStorage = false): unknown | null {
  cleanExpired()
  // 先查内存缓存
  const entry = memoryCache.get(key)
  if (entry && Date.now() <= entry.expiry) {
    // 更新最后访问时间（LRU）
    entry.lastAccess = Date.now()
    return entry.data
  }
  if (entry) {
    memoryCache.delete(key)
    removeFromUrlIndex(key)
  }

  // 再查 localStorage（跨页面缓存共享）
  if (useStorage) {
    try {
      const raw = localStorage.getItem(`cache:${key}`)
      if (raw) {
        const parsed: CacheEntry = JSON.parse(raw)
        if (Date.now() <= parsed.expiry) {
          // 同步到内存缓存加速下次访问
          memoryCache.set(key, parsed)
          return parsed.data
        }
        localStorage.removeItem(`cache:${key}`)
      }
    } catch {
      // ignore storage errors
    }
  }

  return null
}

/**
 * 写入缓存
 * @param key 缓存 key
 * @param data 缓存数据
 * @param ttl 过期时间（毫秒），默认 30 秒
 * @param useStorage 是否持久化到 localStorage
 */
export function setCache(key: string, data: unknown, ttl: number = DEFAULT_TTL, useStorage = false): void {
  cleanExpired()
  // LRU 淘汰
  evictLRU()

  // 提取 URL 段建立索引
  const urlPart = key.split(':')[1] || ''
  indexUrlSegments(key, urlPart)

  const entry: CacheEntry = {
    data,
    expiry: Date.now() + ttl,
    lastAccess: Date.now(),
  }
  memoryCache.set(key, entry)

  // 持久化到 localStorage
  if (useStorage) {
    try {
      localStorage.setItem(`cache:${key}`, JSON.stringify(entry))
    } catch {
      // ignore storage quota exceeded
    }
  }
}

/**
 * 按 URL 前缀清除相关缓存
 * 使用 URL 段索引实现精确匹配失效
 * 例如 POST /api/users 后清除所有 GET:/api/users 开头的缓存
 */
export function invalidateByUrl(url: string): void {
  const segments = url.split('/').filter(Boolean)
  // 取最后一个有意义的路径段作为匹配 key
  const key = segments[segments.length - 1] || segments[0]
  if (!key) {
    // 兜底：清空所有缓存
    clearAll()
    return
  }

  const toDelete = new Set<string>()

  // 同时匹配末段（如 ID）和父段（如资源名 providers）
  const matchKeys = [key]
  if (segments.length >= 2) {
    const parentKey = segments[segments.length - 2]
    if (parentKey && parentKey !== key) {
      matchKeys.push(parentKey)
    }
  }

  for (const mk of matchKeys) {
    if (urlIndex.has(mk)) {
      for (const cacheKey of urlIndex.get(mk)!) {
        if (toDelete.has(cacheKey)) continue
        // 从缓存 key 中提取 URL 部分，精确匹配前缀
        const keyUrl = cacheKey.split(':')[1] || ''
        if (keyUrl.startsWith(url)) {
          toDelete.add(cacheKey)
        }
      }
    }
  }

  for (const k of toDelete) {
    invalidateKey(k)
  }

  // 同时清除 localStorage 中匹配的缓存
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i)
      if (storageKey?.startsWith(`cache:`)) {
        const cacheKey = storageKey.slice(6)
        const keyUrl = cacheKey.split(':')[1] || ''
        if (keyUrl.startsWith(url)) {
          localStorage.removeItem(storageKey)
        }
      }
    }
  } catch {
    // ignore
  }
}

/**
 * 按前缀清除缓存（比按 URL 更宽泛匹配）
 */
export function invalidateByPrefix(prefix: string): void {
  // 清除内存
  for (const key of memoryCache.keys()) {
    if (key.split(':')[1]?.startsWith(prefix)) {
      invalidateKey(key)
    }
  }
  // 清除 localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i)
      if (storageKey?.startsWith(`cache:${prefix}`)) {
        localStorage.removeItem(storageKey)
      }
    }
  } catch {
    // ignore
  }
}

/**
 * 生成缓存 key：method + URL + 序列化参数
 */
export function buildGetCacheKey(url: string, params?: unknown): string {
  return buildKey('GET', url, params)
}

/** 清除所有缓存 */
export function clearAll(): void {
  memoryCache.clear()
  urlIndex.clear()
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('cache:')) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // ignore
  }
}

/**
 * 生成缓存 key
 */
function buildKey(method: string, url: string, params?: unknown): string {
  let key = `${method}:${url}`
  if (params) {
    key += `:${JSON.stringify(params)}`
  }
  return key
}

/** 清除过期缓存 */
function cleanExpired(): void {
  const now = Date.now()
  for (const [k, v] of memoryCache) {
    if (now > v.expiry) {
      invalidateKey(k)
    }
  }
}

/** 从 URL 索引中移除缓存 key */
function removeFromUrlIndex(key: string): void {
  for (const [, keys] of urlIndex) {
    keys.delete(key)
  }
}

/** 完全失效一个 key（内存 + 索引 + localStorage） */
function invalidateKey(key: string): void {
  memoryCache.delete(key)
  removeFromUrlIndex(key)
  try {
    localStorage.removeItem(`cache:${key}`)
  } catch {
    // ignore
  }
}

/** 淘汰最久未访问的缓存条目 */
function evictLRU(): void {
  if (memoryCache.size < MAX_CACHE_SIZE) return

  let oldestKey: string | null = null
  let oldestTime = Infinity
  for (const [k, v] of memoryCache) {
    if (v.lastAccess < oldestTime) {
      oldestTime = v.lastAccess
      oldestKey = k
    }
  }
  if (oldestKey) {
    invalidateKey(oldestKey)
  }
}

/**
 * 提取 URL 中的有意义段，建立索引
 */
function indexUrlSegments(key: string, url: string): void {
  const segments = url.split('/').filter(Boolean)
  for (const seg of segments) {
    if (!urlIndex.has(seg)) {
      urlIndex.set(seg, new Set())
    }
    urlIndex.get(seg)!.add(key)
  }
}
