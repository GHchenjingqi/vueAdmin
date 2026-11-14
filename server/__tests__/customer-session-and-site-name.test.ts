// @vitest-environment node
/**
 * 顾客会话 Cookie 与站点名下发（PLAN 5.2 / 5.4）
 *
 * 5.2：历史实现把 JWT 存 localStorage，XSS 可直接读取。现在登录同时下发 httpOnly Cookie，
 *      中间件优先读 Cookie、其次读 Bearer（两者并存，旧前端不需要同步改造）。
 * 5.4：站点名此前硬编码 'Aurora Hair Studio'，现由 store-config 从后台 site_title 下发。
 *
 * 这里测两个纯逻辑点（不启动 HTTP 服务）：
 * - Cookie 与 Bearer 的优先级（避免 Cookie 被旧令牌覆盖）；
 * - store-config 的 site_name 解析（含回退链）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 中间件依赖 JWT 校验与账号状态查库，这里只验证 token 提取顺序，故整体 mock
vi.mock('../modules/shop/services/customerService.js', () => ({
  verifyCustomerToken: vi.fn((token: string) => {
    if (token === 'cookie-token') return { sub: 1, tenantId: 1, email: 'cookie@t.local' }
    if (token === 'bearer-token') return { sub: 2, tenantId: 1, email: 'bearer@t.local' }
    throw new Error('invalid token')
  }),
}))
vi.mock('../modules/shop/models/index.js', () => ({
  ShopCustomer: { findOne: vi.fn(async () => ({ id: 1, status: 'active' })) },
}))

const { customerAuth, optionalCustomerAuth, CUSTOMER_COOKIE } = await import(
  '../modules/storefront/middleware/customerAuth.js'
)

function makeReq(headers: Record<string, string> = {}, cookies: Record<string, string> = {}) {
  return { headers, cookies } as never
}

function runMiddleware(
  mw: typeof customerAuth,
  req: unknown,
): Promise<{ customer?: { customerId: number }; error?: Error }> {
  return new Promise((resolve) => {
    mw(req as never, {} as never, ((err?: Error) => resolve(err ? { error: err } : { customer: (req as { customer?: { customerId: number } }).customer })) as never)
  })
}

describe('customerAuth token source', () => {
  it('prefers the httpOnly cookie over a stale Bearer token', async () => {
    const req = makeReq({ authorization: 'Bearer bearer-token' }, { [CUSTOMER_COOKIE]: 'cookie-token' })
    const res = await runMiddleware(customerAuth, req)
    expect(res.error).toBeUndefined()
    // Cookie 优先：customerId 来自 cookie-token（1），而不是 bearer-token（2）
    expect(res.customer?.customerId).toBe(1)
  })

  it('falls back to Bearer when no cookie is present', async () => {
    const req = makeReq({ authorization: 'Bearer bearer-token' })
    const res = await runMiddleware(customerAuth, req)
    expect(res.customer?.customerId).toBe(2)
  })

  it('rejects when neither cookie nor Bearer is present', async () => {
    const res = await runMiddleware(customerAuth, makeReq())
    expect(res.error).toBeTruthy()
    expect(res.error?.message).toMatch(/未提供认证令牌/)
  })

  it('optionalCustomerAuth passes through as guest when nothing is provided', async () => {
    const req = makeReq()
    const res = await runMiddleware(optionalCustomerAuth, req)
    expect(res.error).toBeUndefined()
    expect(res.customer).toBeUndefined()
  })
})

describe('store-config siteName', () => {
  const ORIGINAL = process.env.SITE_NAME

  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SITE_NAME
    else process.env.SITE_NAME = ORIGINAL
  })

  async function loadController(optionValue: string | null) {
    vi.doMock('../models/Setting.js', () => ({
      default: { findOne: vi.fn(async () => (optionValue === null ? null : { optionValue })) },
    }))
    vi.doMock('../modules/storefront/middleware/siteContext.js', () => ({
      getSite: () => ({ tenantId: 1, channelId: null, shopId: null, defaultCurrency: 'USD', defaultLocale: 'en-US' }),
    }))
    vi.doMock('../modules/storefront/services/currencyConfig.js', () => ({
      getActiveCurrencyMonitored: async () => ({
        code: 'USD',
        symbol: '$',
        decimalDigits: 2,
        symbolPosition: 'before',
        thousandsSeparator: ',',
        decimalSeparator: '.',
        locale: 'en-US',
      }),
    }))
    return import('../modules/storefront/controllers/storeConfigController.js')
  }

  async function resolveSiteName(optionValue: string | null): Promise<string> {
    const mod = await loadController(optionValue)
    const res = {
      set: () => res,
      json: (body: { data: { siteName: string } }) => {
        captured = body.data.siteName
      },
    }
    let captured = ''
    await mod.config({} as never, res as never, ((err?: Error) => {
      if (err) throw err
    }) as never)
    return captured
  }

  it('uses the backend site_title setting', async () => {
    expect(await resolveSiteName('My Wig Store')).toBe('My Wig Store')
  })

  it('unwraps a JSON-quoted setting value', async () => {
    expect(await resolveSiteName('"Quoted Store"')).toBe('Quoted Store')
  })

  it('falls back to SITE_NAME env then the built-in default', async () => {
    process.env.SITE_NAME = 'Env Store'
    expect(await resolveSiteName(null)).toBe('Env Store')
    delete process.env.SITE_NAME
    vi.resetModules()
    expect(await resolveSiteName(null)).toBe('Aurora Hair Studio')
  })
})
