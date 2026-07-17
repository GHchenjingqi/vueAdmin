import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getCache, setCache, invalidateByUrl, invalidateByPrefix, buildGetCacheKey, clearAll } from '@/utils/requestCache'

describe('requestCache', () => {
  beforeEach(() => {
    clearAll()
    localStorage.clear()
  })

  describe('setCache / getCache', () => {
    it('应能写入和读取缓存', () => {
      setCache('test-key', { name: '张三' })
      expect(getCache('test-key')).toEqual({ name: '张三' })
    })

    it('未命中缓存时返回 null', () => {
      expect(getCache('nonexistent')).toBeNull()
    })

    it('缓存过期后返回 null', () => {
      vi.useFakeTimers()
      setCache('ttl-key', 'data', 5000)
      expect(getCache('ttl-key')).toBe('data')

      vi.advanceTimersByTime(5001)
      expect(getCache('ttl-key')).toBeNull()
      vi.useRealTimers()
    })

    it('默认 TTL 为 30 秒', () => {
      vi.useFakeTimers()
      setCache('default-ttl', 'value')
      vi.advanceTimersByTime(30000)
      // 缓存检查使用 <= 所以刚好 30s 时仍有效
      expect(getCache('default-ttl')).toBe('value')

      vi.advanceTimersByTime(1)
      expect(getCache('default-ttl')).toBeNull()
      vi.useRealTimers()
    })

    it('自定义 TTL 正常工作', () => {
      vi.useFakeTimers()
      setCache('custom-ttl', 'data', 1000)
      vi.advanceTimersByTime(1000)
      expect(getCache('custom-ttl')).toBe('data')

      vi.advanceTimersByTime(1)
      expect(getCache('custom-ttl')).toBeNull()
      vi.useRealTimers()
    })

    it('写入新缓存时清除过期缓存', () => {
      vi.useFakeTimers()
      setCache('expired', 'old', 1000)
      vi.advanceTimersByTime(1001)

      // 写入新缓存时触发 cleanExpired
      setCache('fresh', 'new')
      expect(getCache('expired')).toBeNull()
      expect(getCache('fresh')).toBe('new')
      vi.useRealTimers()
    })

    it('读取缓存时清除过期缓存', () => {
      vi.useFakeTimers()
      setCache('old', 'data', 1000)
      vi.advanceTimersByTime(1001)

      // getCache 内部调用 cleanExpired
      expect(getCache('old')).toBeNull()
      vi.useRealTimers()
    })
  })

  describe('localStorage 持久化', () => {
    it('useStorage=true 时写入 localStorage', () => {
      setCache('persist-key', { value: 42 }, 60000, true)
      const raw = localStorage.getItem('cache:persist-key')
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw!)
      expect(parsed.data).toEqual({ value: 42 })
    })

    it('useStorage=true 时从 localStorage 恢复缓存到内存', () => {
      // 模拟写入 localStorage
      const entry = JSON.stringify({
        data: 'stored-data',
        expiry: Date.now() + 60000,
        lastAccess: Date.now(),
      })
      localStorage.setItem('cache:stored-key', entry)

      expect(getCache('stored-key', true)).toBe('stored-data')
    })

    it('useStorage=false 时不从 localStorage 读取', () => {
      const entry = JSON.stringify({
        data: 'stored-data',
        expiry: Date.now() + 60000,
        lastAccess: Date.now(),
      })
      localStorage.setItem('cache:stored-key', entry)

      // 不使用 useStorage，应返回 null
      expect(getCache('stored-key')).toBeNull()
    })

    it('localStorage 过期条目被清除', () => {
      vi.useFakeTimers()
      const expiredEntry = JSON.stringify({
        data: 'expired',
        expiry: Date.now() - 1000,
        lastAccess: Date.now(),
      })
      localStorage.setItem('cache:expired-key', expiredEntry)

      expect(getCache('expired-key', true)).toBeNull()
      expect(localStorage.getItem('cache:expired-key')).toBeNull()
      vi.useRealTimers()
    })
  })

  describe('maxSize 限制', () => {
    it('缓存超过 200 条时淘汰最早的条目', () => {
      // 填满 200 条
      for (let i = 0; i < 200; i++) {
        setCache(`key-${i}`, `val-${i}`)
      }

      // 写入第 201 条，应淘汰 key-0
      setCache('key-200', 'val-200')
      expect(getCache('key-0')).toBeNull()
      expect(getCache('key-200')).toBe('val-200')
      // key-1 应仍在
      expect(getCache('key-1')).toBe('val-1')
    })
  })

  describe('invalidateByUrl', () => {
    it('按 URL 前缀清除相关缓存', () => {
      const key1 = buildGetCacheKey('/api/users', { page: 1 })
      const key2 = buildGetCacheKey('/api/users', { page: 2 })
      const key3 = buildGetCacheKey('/api/roles')

      setCache(key1, 'users-p1')
      setCache(key2, 'users-p2')
      setCache(key3, 'roles')

      invalidateByUrl('/api/users')

      expect(getCache(key1)).toBeNull()
      expect(getCache(key2)).toBeNull()
      expect(getCache(key3)).toBe('roles')
    })

    it('带数字 ID 的 URL 清除时去除尾部 ID 匹配', () => {
      const key = buildGetCacheKey('/api/users/123')
      setCache(key, 'user-detail')

      invalidateByUrl('/api/users/123')
      expect(getCache(key)).toBeNull()
    })

    it('不匹配的 URL 不受影响', () => {
      const key = buildGetCacheKey('/api/settings')
      setCache(key, 'settings')

      invalidateByUrl('/api/users')
      expect(getCache(key)).toBe('settings')
    })

    it('清除 localStorage 中匹配的持久化缓存', () => {
      const key = buildGetCacheKey('/api/orgs')
      setCache(key, 'org-data', 60000, true)

      expect(getCache(key, true)).toBe('org-data')

      invalidateByUrl('/api/orgs')

      expect(getCache(key)).toBeNull()
      expect(localStorage.getItem(`cache:${key}`)).toBeNull()
    })
  })

  describe('invalidateByPrefix', () => {
    it('按路径前缀清除相关缓存', () => {
      const key1 = buildGetCacheKey('/api/users/list')
      const key2 = buildGetCacheKey('/api/users/detail')
      const key3 = buildGetCacheKey('/api/roles/list')

      setCache(key1, 'users-list')
      setCache(key2, 'users-detail')
      setCache(key3, 'roles-list')

      invalidateByPrefix('/api/users')

      expect(getCache(key1)).toBeNull()
      expect(getCache(key2)).toBeNull()
      expect(getCache(key3)).toBe('roles-list')
    })

    it('清除 localStorage 中匹配的持久化缓存', () => {
      const key = buildGetCacheKey('/api/data/reports')
      setCache(key, 'report', 60000, true)

      invalidateByPrefix('/api/data/reports')

      expect(localStorage.getItem(`cache:${key}`)).toBeNull()
    })
  })

  describe('buildGetCacheKey', () => {
    it('无参数时生成简单 key', () => {
      expect(buildGetCacheKey('/api/users')).toBe('GET:/api/users')
    })

    it('带参数时序列化到 key 中', () => {
      expect(buildGetCacheKey('/api/users', { page: 1 })).toBe('GET:/api/users:{"page":1}')
    })

    it('不同参数生成不同 key', () => {
      const key1 = buildGetCacheKey('/api/users', { page: 1 })
      const key2 = buildGetCacheKey('/api/users', { page: 2 })
      expect(key1).not.toBe(key2)
    })
  })

  describe('clearAll', () => {
    it('清除所有缓存（包括 localStorage）', () => {
      setCache('mem-a', 1)
      setCache('mem-b', 2)
      setCache('mem-c', 3, 60000, true)

      clearAll()
      expect(getCache('mem-a')).toBeNull()
      expect(getCache('mem-b')).toBeNull()
      expect(getCache('mem-c')).toBeNull()
      expect(localStorage.getItem('cache:mem-c')).toBeNull()
    })
  })
})
