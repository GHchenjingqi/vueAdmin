/**
 * 轻量两级缓存工具（内存 L1 + Redis L2）
 *
 * 设计要点：
 * - L1：进程内 lru-cache（TTL + 最大条目），命中最快、零网络。
 * - L2：Redis（config.redis.enabled 时启用），跨进程/跨重启共享；不可用时自动降级到 L1。
 * - getOrSet 命中顺序：L1 → L2 → loader；命中 L2 时回填 L1。
 * - 写入/失效级联 L1 与 L2；clear() 清空当前命名空间（L1 reset + L2 按前缀 SCAN 删除）。
 * - namespace 用于 Redis 键前缀隔离与整命名空间失效，避免不同业务键冲突。
 * - 测试环境（NODE_ENV=test）自动禁用，强制每次走 loader，保证单测确定性；
 *   需要强制开启可显式传 disabled:false。
 * - 存储值统一 JSON 序列化（clone），Sequelize 实例会自动 toJSON，保证 L1/L2 一致且不可被调用方误改。
 */
// lru-cache v6 同时提供 CJS(export = class) 与 ESM(named export) 两种产物：
// - 类型(ESM .d.ts)只暴露命名导出 LRUCache，无 default；
// - 运行时(tsx 走 CJS) 则是默认导出。
// 统一在此收口：优先取 default（CJS 运行时），回退到命名导出（ESM 类型对齐）。
// LRU 实例以 any 承接，规避 v6 ESM 类型声明中 maxAge/del/reset 的联合类型怪异问题。
import * as LRUCacheNS from 'lru-cache'
import config from '../config/index.js'
import { getRedis } from '../config/redis.js'

const LRU: any = (LRUCacheNS as any).default ?? LRUCacheNS

const REDIS_PREFIX = 'wb:cache'

/** 测试环境自动禁用缓存（不依赖 Redis、不污染单测） */
function isTest(): boolean {
  return process.env.NODE_ENV === 'test'
}

/**
 * 稳定序列化：递归排序对象键，保证同一查询无论键顺序都产生同一缓存键。
 *
 * 历史坑：早期实现写成 `JSON.stringify(obj, Object.keys(obj).sort())`——
 * JSON.stringify 的第二参数是**键名白名单（replacer array）且递归生效**，
 * 会把嵌套对象（如 where: { tenantId, status }）中不在白名单的键全部剥掉，
 * 导致不同租户/不同过滤条件共用同一缓存键（跨租户泄漏 + 错误结果）。
 * 因此这里显式深拷贝排序后再序列化，绝不使用 replacer array。
 */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortDeep((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

export function stableKey(obj: unknown): string {
  return JSON.stringify(sortDeep(obj ?? {}))
}

export interface CacheOptions {
  /** 最大条目数（L1） */
  max?: number
  /** 条目存活时间（毫秒） */
  maxAgeMs?: number
  /** 显式禁用；未指定时测试环境自动禁用 */
  disabled?: boolean
  /** 命名空间，用于 Redis L2 键前缀与整命名空间失效 */
  namespace?: string
  /** 是否启用 Redis L2；默认跟随 config.redis.enabled。传 false 则仅用内存 L1 */
  l2?: boolean
}

export interface ICache<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  del(key: string): void
  /** 清空当前命名空间（L1 + L2），异步以兼容 L2 SCAN */
  clear(): Promise<void>
  /** 未命中则调用 loader 加载并缓存；命中直接返回 */
  getOrSet(key: string, loader: () => Promise<T>): Promise<T>
}

function clone<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value))
}

export function createCache<T>(opts: CacheOptions = {}): ICache<T> {
  const disabled = opts.disabled ?? isTest()
  const ns = opts.namespace || 'default'
  const l2Enabled = opts.l2 ?? config.redis.enabled
  const lru = disabled ? null : new LRU({ max: opts.max ?? 500, maxAge: opts.maxAgeMs ?? 5 * 60 * 1000 })
  const ttlSec = opts.maxAgeMs && opts.maxAgeMs > 0 ? Math.ceil(opts.maxAgeMs / 1000) : 0

  const redisKey = (key: string) => `${REDIS_PREFIX}:${ns}:${key}`

  /** 等待 Redis 连接就绪；未启用/连接关闭/超时则返回 null（缓存优雅降级到 L1/loader） */
  async function whenReady(): Promise<any | null> {
    if (!l2Enabled) return null
    const r = getRedis()
    if (!r) return null
    if (r.status === 'ready') return r
    if (r.status === 'end') return null
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        r.off('ready', onReady)
        r.off('close', onClose)
        r.off('error', onError)
        resolve(ok ? r : null)
      }
      const onReady = () => done(true)
      const onClose = () => done(false)
      const onError = () => done(false)
      r.on('ready', onReady)
      r.on('close', onClose)
      r.on('error', onError)
      setTimeout(() => done(r.status === 'ready'), 3000).unref?.()
    })
  }

  async function redisGet(key: string): Promise<T | undefined> {
    const r = await whenReady()
    if (!r) return undefined
    try {
      const raw = await r.get(redisKey(key))
      return raw ? (JSON.parse(raw) as T) : undefined
    } catch {
      return undefined
    }
  }

  async function redisSet(key: string, value: T): Promise<void> {
    const r = await whenReady()
    if (!r) return
    try {
      if (ttlSec > 0) await r.set(redisKey(key), JSON.stringify(value), 'EX', ttlSec)
      else await r.set(redisKey(key), JSON.stringify(value))
    } catch {
      /* Redis 写入失败不阻断主流程 */
    }
  }

  async function redisDel(key: string): Promise<void> {
    const r = await whenReady()
    if (!r) return
    try {
      await r.del(redisKey(key))
    } catch {
      /* ignore */
    }
  }

  async function redisClear(): Promise<void> {
    if (!l2Enabled) return
    const r = await whenReady()
    if (!r) return
    try {
      const pattern = `${REDIS_PREFIX}:${ns}:*`
      let cursor = '0'
      do {
        const [next, keys] = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = next
        if (keys.length) await r.del(...keys)
      } while (cursor !== '0')
    } catch {
      /* ignore */
    }
  }

  if (disabled) {
    return {
      get: () => undefined,
      set: () => {},
      del: () => {},
      clear: async () => {},
      getOrSet: async (_key, loader) => loader(),
    }
  }

  return {
    get: (key) => (lru as any).get(key),
    set: (key, value) => {
      ;(lru as any).set(key, clone(value))
    },
    del: (key) => {
      ;(lru as any).del(key)
      void redisDel(key)
    },
    clear: async () => {
      ;(lru as any).reset()
      await redisClear()
    },
    getOrSet: async (key, loader) => {
      const hit = (lru as any).get(key)
      if (hit !== undefined) return hit
      const l2 = await redisGet(key)
      if (l2 !== undefined) {
        ;(lru as any).set(key, l2)
        return l2
      }
      const value = await loader()
      ;(lru as any).set(key, clone(value))
      void redisSet(key, value)
      return value
    },
  }
}
