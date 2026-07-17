/**
 * useRequestCache.ts 单元测试
 * 覆盖：缓存、去重、LRU、过期清理
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCachedRequest, clearAllCache, clearCacheByPrefix, getCacheStats } from '../composables/useRequestCache'

describe('useRequestCache', () => {
  beforeEach(() => {
    clearAllCache()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('execute', () => {
    it('首次请求调用 fetcher 并缓存结果', async () => {
      const fetcher = vi.fn(() => Promise.resolve({ id: 1 }))

      const { data, execute } = useCachedRequest('test-key', fetcher)

      await execute()

      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(data.value).toEqual({ id: 1 })
    })

    it('缓存命中时不调用 fetcher', async () => {
      const fetcher = vi.fn(() => Promise.resolve('cached'))

      const { execute } = useCachedRequest('cache-key', fetcher, 10_000)

      await execute()
      await execute()

      expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('缓存过期后重新请求', async () => {
      const fetcher = vi.fn(() => Promise.resolve('fresh'))

      const { execute } = useCachedRequest('expire-key', fetcher, 5_000)

      await execute()
      expect(fetcher).toHaveBeenCalledTimes(1)

      // 前进 6 秒
      vi.advanceTimersByTime(6_000)
      await execute()

      expect(fetcher).toHaveBeenCalledTimes(2)
    })

    it('forceRefresh 跳过缓存', async () => {
      const fetcher = vi.fn(() => Promise.resolve('data'))

      const { execute } = useCachedRequest('force-key', fetcher)

      await execute()
      await execute(true)

      expect(fetcher).toHaveBeenCalledTimes(2)
    })
  })

  describe('请求去重', () => {
    it('相同 key 的并发请求合并为一次', async () => {
      let resolvePromise: (value: unknown) => void
      const fetcher = vi.fn(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve
          }),
      )

      const { execute } = useCachedRequest('dedup-key', fetcher)

      const p1 = execute()
      const p2 = execute()
      const p3 = execute()

      resolvePromise!('result')
      await Promise.all([p1, p2, p3])

      expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('合并的请求返回相同结果', async () => {
      const fetcher = vi.fn(() => Promise.resolve('shared-result'))

      const { execute } = useCachedRequest('shared-key', fetcher)

      const [r1, r2, r3] = await Promise.all([execute(), execute(), execute()])

      expect(r1).toBe('shared-result')
      expect(r2).toBe('shared-result')
      expect(r3).toBe('shared-result')
    })
  })

  describe('错误处理', () => {
    it('fetcher 抛出错误时设置 error', async () => {
      const fetcher = vi.fn(() => Promise.reject(new Error('网络错误')))

      const { error, execute } = useCachedRequest('error-key', fetcher)

      await execute()

      expect(error.value).toBe('网络错误')
    })

    it('非 Error 类型错误使用默认消息', async () => {
      const fetcher = vi.fn(() => Promise.reject('string-error'))

      const { error, execute } = useCachedRequest('string-error-key', fetcher)

      await execute()

      expect(error.value).toBe('请求失败')
    })

    it('错误时清理 pending 请求', async () => {
      const fetcher = vi.fn(() => Promise.reject(new Error('fail')))

      const { execute } = useCachedRequest('fail-key', fetcher)

      await execute()

      const stats = getCacheStats()
      expect(stats.pending).toBe(0)
    })
  })

  describe('clearCache', () => {
    it('清除指定 key 的缓存', async () => {
      const fetcher = vi.fn(() => Promise.resolve('data'))

      const { execute, clearCache } = useCachedRequest('clear-key', fetcher)

      await execute()
      clearCache()

      await execute()

      expect(fetcher).toHaveBeenCalledTimes(2)
    })

    it('清除缓存后 data 为 null', async () => {
      const fetcher = vi.fn(() => Promise.resolve('data'))

      const { data, execute, clearCache } = useCachedRequest('clear-data-key', fetcher)

      await execute()
      clearCache()

      expect(data.value).toBeNull()
    })
  })

  describe('clearAllCache', () => {
    it('清除所有缓存', async () => {
      const fetcher1 = vi.fn(() => Promise.resolve('a'))
      const fetcher2 = vi.fn(() => Promise.resolve('b'))

      const { execute: exec1 } = useCachedRequest('all-1', fetcher1)
      const { execute: exec2 } = useCachedRequest('all-2', fetcher2)

      await exec1()
      await exec2()

      clearAllCache()

      await exec1()
      await exec2()

      expect(fetcher1).toHaveBeenCalledTimes(2)
      expect(fetcher2).toHaveBeenCalledTimes(2)
    })
  })

  describe('clearCacheByPrefix', () => {
    it('按前缀清除缓存', async () => {
      const fetcher = vi.fn(() => Promise.resolve('prefix-data'))

      const { execute: exec1 } = useCachedRequest('user:1', fetcher)
      const { execute: exec2 } = useCachedRequest('user:2', fetcher)
      const { execute: exec3 } = useCachedRequest('post:1', fetcher)

      await exec1()
      await exec2()
      await exec3()

      clearCacheByPrefix('user:')

      await exec1()
      await exec2()
      await exec3()

      expect(fetcher).toHaveBeenCalledTimes(5) // user:1 x2 + user:2 x2 + post:1 x1
    })
  })

  describe('getCacheStats', () => {
    it('返回缓存统计信息', async () => {
      const fetcher = vi.fn(() => Promise.resolve('stats'))

      const { execute } = useCachedRequest('stats-key', fetcher)

      await execute()

      const stats = getCacheStats()

      expect(stats.size).toBe(1)
      expect(stats.keys).toContain('stats-key')
      expect(stats.pending).toBe(0)
    })
  })

  describe('LRU 淘汰', () => {
    it('超过最大缓存数时淘汰最旧条目', async () => {
      const fetcher = vi.fn((key: string) => Promise.resolve(key))

      // 填充 100 个缓存
      for (let i = 0; i < 100; i++) {
        const { execute } = useCachedRequest(`lru-${i}`, () => fetcher(`lru-${i}`))
        await execute()
      }

      // 添加第 101 个
      const { execute: execNew } = useCachedRequest('lru-new', () => fetcher('lru-new'))
      await execNew()

      const stats = getCacheStats()
      expect(stats.size).toBeLessThanOrEqual(100)
    })
  })
})
