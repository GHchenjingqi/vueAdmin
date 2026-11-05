// @vitest-environment node
/**
 * P4-T15 安全测试（渗透式门禁）
 *
 * 覆盖验收口径：
 * - 越权访问控制：requireAdmin 守卫（非管理员 → 403，无法修改币种配置）
 * - CSRF 纵深：originValidator 拒绝跨站写请求
 * - 限流：登录暴力破解在窗口内超过阈值被锁定
 * - 注入：SQLi 载荷按字面量处理，无数据泄露/无 SQL 报错
 * - 订单枚举：订单查询强制绑定 (id, accessToken) 双因子，无 token 不可枚举
 * - 配置接口越权修改：币种切换/回滚/变更审计均挂 requireAdmin（源码回归锁定）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../middleware/errorHandler.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import originValidator from '../middleware/originValidator.js'
import { checkRateLimit, recordAttempt, clearAttempts, setStore } from '../middleware/rateLimiter.js'
import { MemoryRateLimitStore } from '../middleware/rateLimitStore.js'
import * as couponService from '../modules/storefront/services/couponService.js'
import { runInTenant } from '../modules/tenant/context.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------- 工具：构造 mock req/res/next ----------
interface MockRes extends Response {
  statusCode: number
  body: unknown
}
function mockRes(): MockRes {
  const res = {
    statusCode: 200 as number,
    body: null as unknown,
    status(this: { statusCode: number }, code: number) {
      this.statusCode = code
      return this as unknown as Response
    },
    json(this: { body: unknown }, body: unknown) {
      this.body = body
      return this as unknown as Response
    },
  }
  return res as unknown as MockRes
}

/** 记录 next 调用：区分放行（无参）与错误（带 AppError） */
function mockNext() {
  const state = { called: false, err: null as unknown }
  const next: NextFunction = (err?: unknown) => {
    state.called = true
    state.err = err ?? null
  }
  return { state, next }
}

// ========== 1. 越权访问控制：requireAdmin ==========
describe('P4-T15 越权访问控制 requireAdmin', () => {
  it('未认证（无 req.user）→ 401 AUTH_REQUIRED，不放行', () => {
    const req = {} as Request
    const res = mockRes()
    const { state, next } = mockNext()
    requireAdmin(req, res, next)
    expect(state.called).toBe(true)
    expect(state.err).toBeInstanceOf(AppError)
    expect((state.err as AppError).statusCode).toBe(401)
    expect((state.err as AppError).message).toBe('AUTH_REQUIRED')
  })

  it('普通用户（isPlatformAdmin=false）→ 403 ADMIN_REQUIRED，不得改配置', () => {
    const req = { user: { id: 2, username: 'merchant', isPlatformAdmin: false } } as unknown as Request
    const res = mockRes()
    const { state, next } = mockNext()
    requireAdmin(req, res, next)
    expect(state.called).toBe(true)
    expect(state.err).toBeInstanceOf(AppError)
    expect((state.err as AppError).statusCode).toBe(403)
    expect((state.err as AppError).message).toBe('ADMIN_REQUIRED')
  })

  it('管理员（isPlatformAdmin=true）→ 放行到控制器', () => {
    const req = { user: { id: 1, username: 'admin', isPlatformAdmin: true } } as unknown as Request
    const res = mockRes()
    const { state, next } = mockNext()
    requireAdmin(req, res, next)
    expect(state.called).toBe(true)
    expect(state.err).toBeNull()
  })
})

// ========== 2. CSRF 纵深：originValidator ==========
describe('P4-T15 CSRF originValidator', () => {
  function runOrigin(origin: string | undefined, referer: string | undefined, method = 'POST') {
    const req = { method, headers: { origin, referer } } as unknown as Request
    const res = mockRes()
    let nextCalled = false
    let nextErr: unknown = null
    const next: NextFunction = (err?: unknown) => { if (err) nextErr = err; else nextCalled = true }
    originValidator(req, res, next)
    return { nextCalled, nextErr, res }
  }

  it('跨站 Origin+Referer 写请求 → 拒绝（403），不放行', () => {
    const { nextCalled, nextErr, res } = runOrigin('https://evil.example', 'https://evil.example')
    expect(nextCalled).toBe(false)
    expect(nextErr).toBeNull()
    expect(res.statusCode).toBe(403)
    expect(res.body).toMatchObject({ code: 403 })
  })

  it('白名单 Origin → 放行', () => {
    const { nextCalled, nextErr } = runOrigin('http://localhost:5174', undefined)
    expect(nextErr).toBeNull()
    expect(nextCalled).toBe(true)
  })

  it('无 Origin（同源/服务间）→ 放行', () => {
    const { nextCalled, nextErr } = runOrigin(undefined, undefined)
    expect(nextErr).toBeNull()
    expect(nextCalled).toBe(true)
  })
})

// ========== 3. 限流：暴力破解锁定 ==========
describe('P4-T15 登录限流', () => {
  const ip = '10.0.0.1'
  const user = 'bruteforce_user'
  beforeEach(async () => {
    setStore(new MemoryRateLimitStore())
    await clearAttempts(ip, user)
  })

  it('窗口内超过 5 次失败 → 锁定（checkRateLimit 拒绝）', async () => {
    for (let i = 0; i < 5; i++) await recordAttempt(ip, user)
    const result = await checkRateLimit(ip, user)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it('成功登录后清除计数 → 重新放行', async () => {
    for (let i = 0; i < 5; i++) await recordAttempt(ip, user)
    await clearAttempts(ip, user)
    const result = await checkRateLimit(ip, user)
    expect(result.allowed).toBe(true)
  })
})

// ========== 4. 注入：SQLi 字面量 ==========
describe('P4-T15 SQL 注入防护', () => {
  it('注入载荷按字面量处理 → COUPON_NOT_FOUND，无 SQL 报错/无数据泄露', async () => {
    await runInTenant({ tenantId: 1 }, async () => {
      const payload = "' OR '1'='1 --"
      await expect(couponService.evaluateCoupon(payload, { currency: 'USD', subtotalCents: 10000 }))
        .rejects.toMatchObject({ statusCode: 404, message: expect.stringContaining('COUPON_NOT_FOUND') })
    })
  })

  it('注入载荷含分号/注释符 → 仍按字面量，不破坏查询', async () => {
    await runInTenant({ tenantId: 1 }, async () => {
      const payload = "x'); DROP TABLE coupons; --"
      await expect(couponService.evaluateCoupon(payload, { currency: 'USD', subtotalCents: 10000 }))
        .rejects.toMatchObject({ statusCode: 404 })
    })
  })
})

// ========== 5. 订单枚举：双因子绑定回归（源码锁定） ==========
describe('P4-T15 订单枚举防护（源码回归）', () => {
  it('getOrderWithToken 查询必须同时绑定 id 与 accessToken', () => {
    const src = readFileSync(join(__dirname, '../modules/storefront/services/checkoutService.ts'), 'utf8')
    expect(src).toMatch(/where:\s*\{\s*id:\s*orderId,\s*accessToken,[^}]*tenantId/)
  })
})

// ========== 6. 配置接口越权修改回归（源码锁定） ==========
describe('P4-T15 配置接口越权修改（源码回归）', () => {
  it('币种切换/回滚/审计路由均挂 requireAdmin', () => {
    const src = readFileSync(join(__dirname, '../modules/shop/routes/index.ts'), 'utf8')
    const put = src.match(/router\.put\('\/settings\/currency',[^\n]*/)
    const rollback = src.match(/router\.post\('\/settings\/currency\/rollback',[^\n]*/)
    const changes = src.match(/router\.get\('\/config-changes',[^\n]*/)
    expect(put?.[0]).toContain('requireAdmin')
    expect(rollback?.[0]).toContain('requireAdmin')
    expect(changes?.[0]).toContain('requireAdmin')
  })
})

// ========== 7. 优惠券滥用：伪造/注入型码不得产生折扣 ==========
describe('P4-T15 优惠券滥用防护', () => {
  it('伪造优惠券码（不存在）→ 拒绝，不产生任何折扣', async () => {
    await runInTenant({ tenantId: 1 }, async () => {
      await expect(couponService.evaluateCoupon('FORGED-CODE-9f3a', { currency: 'USD', subtotalCents: 10000 }))
        .rejects.toMatchObject({ statusCode: 404 })
    })
  })

  it('注入型载荷当作优惠码被拒，绝不意外命中折扣规则', async () => {
    await runInTenant({ tenantId: 1 }, async () => {
      const payloads = ["' OR 1=1 --", '1; SELECT * FROM coupons', '${jndi:ldap://evil}']
      for (const p of payloads) {
        await expect(couponService.evaluateCoupon(p, { currency: 'USD', subtotalCents: 10000 }))
          .rejects.toMatchObject({ statusCode: 404 })
      }
    })
  })
})
