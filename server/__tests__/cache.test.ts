import { describe, it, expect, vi } from 'vitest'
import { createCache, stableKey } from '../utils/cache.js'

describe('createCache (L1, disabled:false 强制开启)', () => {
  it('getOrSet 命中缓存后不再调用 loader', async () => {
    const cache = createCache<number>({ max: 10, maxAgeMs: 1000, disabled: false, l2: false })
    const loader = vi.fn(async () => 42)
    const a = await cache.getOrSet('k', loader)
    const b = await cache.getOrSet('k', loader)
    expect(a).toBe(42)
    expect(b).toBe(42)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('del 使缓存失效并重新加载', async () => {
    const cache = createCache<number>({ disabled: false, l2: false })
    const loader = vi.fn(async () => 1)
    await cache.getOrSet('x', loader)
    cache.del('x')
    await cache.getOrSet('x', loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('clear 清空命名空间后需重新加载', async () => {
    const cache = createCache<number>({ disabled: false, l2: false, namespace: 'c1' })
    const loader = vi.fn(async () => 5)
    await cache.getOrSet('x', loader)
    await cache.clear()
    await cache.getOrSet('x', loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('disabled 时每次都走 loader 且 get 不命中', async () => {
    const cache = createCache<number>({ disabled: true })
    const loader = vi.fn(async () => 7)
    await cache.getOrSet('y', loader)
    await cache.getOrSet('y', loader)
    expect(loader).toHaveBeenCalledTimes(2)
    expect(cache.get('y')).toBeUndefined()
  })

  it('不同 namespace 的相同 key 互不影响', async () => {
    const a = createCache<number>({ disabled: false, l2: false, namespace: 'ns-a' })
    const b = createCache<number>({ disabled: false, l2: false, namespace: 'ns-b' })
    await a.getOrSet('same', async () => 1)
    const fromB = await b.getOrSet('same', async () => 2)
    expect(fromB).toBe(2)
  })
})

describe('stableKey 稳定序列化', () => {
  it('键顺序不同但内容相同 -> 相同 key', () => {
    expect(stableKey({ a: 1, b: 2 })).toBe(stableKey({ b: 2, a: 1 }))
  })
  it('内容不同 -> 不同 key', () => {
    expect(stableKey({ a: 1 })).not.toBe(stableKey({ a: 2 }))
  })
  it('undefined 安全', () => {
    expect(stableKey(undefined)).toBe('{}')
  })
})
