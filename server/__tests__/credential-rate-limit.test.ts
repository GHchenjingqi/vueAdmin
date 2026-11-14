// @vitest-environment node
/**
 * 后台支付凭据接口限流（方向3）实证：
 * - 通用按键限流在窗口内第 N+1 次拒绝，且不同租户/IP 的计数互相隔离；
 * - controller 层超限返回 429（AppError），不泄露任何凭据信息。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { MemoryRateLimitStore } from '../middleware/rateLimitStore.js'
import { checkKeyedRateLimit, setStore } from '../middleware/rateLimiter.js'
import { getCredentials } from '../modules/shop/controllers/paymentChannelsController.js'
import { runInTenant } from '../modules/tenant/context.js'

const TID = 987802
const IP = '10.9.9.9'

beforeEach(() => {
  setStore(new MemoryRateLimitStore())
})

afterEach(() => {
  setStore(new MemoryRateLimitStore())
  vi.restoreAllMocks()
})

describe('通用按键限流', () => {
  it('窗口内第 maxAttempts+1 次被拒绝', async () => {
    const key = `rate:test:${Date.now()}`
    for (let i = 0; i < 5; i++) {
      expect((await checkKeyedRateLimit(key, 60_000, 5)).allowed).toBe(true)
    }
    const blocked = await checkKeyedRateLimit(key, 60_000, 5)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfter).toBeGreaterThan(0)
  })

  it('不同 key 计数互相隔离', async () => {
    const prefix = `rate:test:${Date.now()}`
    for (let i = 0; i < 5; i++) await checkKeyedRateLimit(`${prefix}:a`, 60_000, 5)
    expect((await checkKeyedRateLimit(`${prefix}:b`, 60_000, 5)).allowed).toBe(true)
  })
})

describe('凭据接口 controller 限流', () => {
  it('读接口超限时抛 429，且不触发凭据读取', async () => {
    const key = `rate:cred:read:${TID}:${IP}`
    for (let i = 0; i < 60; i++) await checkKeyedRateLimit(key, 60 * 1000, 60)
    await runInTenant({ tenantId: TID }, async () => {
      const req = { ip: IP, user: { id: 1 } } as unknown as Request
      const res = { json: vi.fn() } as unknown as Response
      const next = vi.fn() as unknown as NextFunction
      await getCredentials(req, res, next)
      expect(next).toHaveBeenCalledTimes(1)
      const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { statusCode: number; message: string }
      expect(err.statusCode).toBe(429)
      expect(err.message).toMatch(/RATE_LIMITED/)
      expect(res.json).not.toHaveBeenCalled()
    })
  })

  it('未超限时正常返回掩码列表', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const req = { ip: '10.9.9.10', user: { id: 1 } } as unknown as Request
      const res = { json: vi.fn() } as unknown as Response
      const next = vi.fn() as unknown as NextFunction
      await getCredentials(req, res, next)
      expect(next).not.toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledTimes(1)
      const payload = (res.json as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
        data: { providers: { id: string }[] }
      }
      // PLAN 6.1：新增 stripe 通道，顺序与 PROVIDER_CREDENTIALS 定义一致
      expect(payload.data.providers.map((p) => p.id)).toEqual(['paypal', 'wechat', 'alipay', 'stripe', 'unionpay'])
    })
  })
})
