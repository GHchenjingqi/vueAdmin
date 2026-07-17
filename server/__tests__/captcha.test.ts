/**
 * captcha.ts 单元测试
 * 覆盖：generate、verify、过期清理
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generate, verify } from '../utils/captcha'

// Mock svg-captcha
vi.mock('svg-captcha', () => ({
  default: {
    createMathExpr: vi.fn(() => ({
      text: '5',
      data: '<svg>5</svg>',
    })),
  },
}))

describe('captcha.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('generate', () => {
    it('生成验证码返回 key 和 svg', () => {
      const result = generate()

      expect(result.key).toBeDefined()
      expect(result.svg).toBe('<svg>5</svg>')
    })

    it('每次生成不同的 key', () => {
      const r1 = generate()
      const r2 = generate()

      expect(r1.key).not.toBe(r2.key)
    })
  })

  describe('verify', () => {
    it('正确的 key 和 text 验证成功', () => {
      const { key } = generate()
      const result = verify(key, '5')

      expect(result).toBe(true)
    })

    it('验证后 key 被删除（一次性）', () => {
      const { key } = generate()
      verify(key, '5')
      const result = verify(key, '5')

      expect(result).toBe(false)
    })

    it('错误的 text 验证失败', () => {
      const { key } = generate()
      const result = verify(key, 'wrong')

      expect(result).toBe(false)
    })

    it('不存在的 key 验证失败', () => {
      const result = verify('non-existent-key', '5')

      expect(result).toBe(false)
    })

    it('缺少 key 或 text 验证失败', () => {
      expect(verify('', '5')).toBe(false)
      expect(verify('key', '')).toBe(false)
      expect(verify('', '')).toBe(false)
    })

    it('过期验证码验证失败', () => {
      const { key } = generate()

      // 前进 6 分钟（超过 5 分钟 TTL）
      vi.advanceTimersByTime(6 * 60 * 1000)

      const result = verify(key, '5')

      expect(result).toBe(false)
    })

    it('忽略大小写和空格', () => {
      const { key } = generate()
      const result = verify(key, '  5  ')

      expect(result).toBe(true)
    })
  })
})
