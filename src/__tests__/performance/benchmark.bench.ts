/**
 * 性能基准测试
 *
 * 使用 Vitest bench 测量关键操作的性能基线。
 * 运行: npx vitest bench
 */
import { bench, describe } from 'vitest'

describe('性能基准测试', () => {
  bench('JSON.stringify(headers)', () => {
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer token' }
    JSON.stringify(headers)
  })

  bench('URL 构建', () => {
    const baseUrl = '/api/users'
    const params = new URLSearchParams({ page: '1', pageSize: '20' })
    void `${baseUrl}?${params.toString()}`
  })

  bench('大型数组 filter + map', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `Item ${i}`, value: i * 2 }))
    items.filter((item) => item.id % 2 === 0).map((item) => ({ ...item, doubled: item.value * 2 }))
  })

  bench('日期格式化', () => {
    const now = new Date()
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    void dateStr
  })

  bench('正则校验邮箱', () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    emailRegex.test('test@example.com')
    emailRegex.test('invalid-email')
  })

  bench('防抖函数创建', () => {
    const fn = () => {
      // no-op
    }
    const debounced = (callback: () => void, ms: number) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      return (...args: unknown[]) => {
        clearTimeout(timer)
        timer = setTimeout(() => callback(...(args as Parameters<typeof callback>)), ms)
      }
    }
    debounced(fn, 300)
  })

  bench('深拷贝（小对象）', () => {
    const obj = { id: 1, name: 'test', nested: { value: 42 } }
    JSON.parse(JSON.stringify(obj))
  })

  bench('深拷贝（大对象）', () => {
    const obj = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      data: { x: i * 2, y: i * 3 },
      tags: [`tag${i}`, `tag${i + 1}`],
    }))
    JSON.parse(JSON.stringify(obj))
  })
})
