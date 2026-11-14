import type { Cart, CartItem } from '@shared/types/commerce'
import type { OrderDetail, OrderDraft, Quote, QuoteTotals } from '@shared/types/commerce'
import type { Money } from '@shared/types/currency'

/**
 * 商务接口数据源切换 + 真实契约适配层（前端接线）
 *
 * NUXT_COMMERCE_SOURCE（runtimeConfig.commerceSource）：
 * - 'auto'（默认）：real 优先，网络级失败（ECONNREFUSED/超时）回退 mock；4xx 为真实业务错误原样透传
 * - 'real'：仅真实后台
 * - 'mock'：shared/mock 契约层（后端不可用时的独立开发模式）
 *
 * 真实契约（并行 Agent 步骤4，/api/storefront/v1）：
 * - Cookie `cart_token`（HttpOnly，addItem 时下发）；也接受 X-Cart-Token 头
 * - cart view: {token,currency,items:[{id,skuId,spuId,qty,title,unitAmountCents,currency,available}]}
 * - quote: POST /checkout/quote {cartToken} → 平铺分字段（subtotalCents/.../amountCents + version/expiresAt）
 * - order: POST /checkout/orders {idempotencyKey,email,shippingAddress,note?,cartToken} → OrderView（含 accessToken）
 * - getOrder: GET /checkout/orders/:id?accessToken=（数字 id，防枚举 404）
 * - pay: POST /payments/session {orderId} → {provider,providerRef,sessionId,amountCents,currency,...}
 *   mock provider 无收单页：由 provider 服务器发签名 Webhook（HMAC-SHA256(rawBody, PAYMENT_WEBHOOK_SECRET) 头 x-mock-signature）
 *   → 本层提供 mock 支付商模拟器（仅 provider==='mock' 时，模拟 provider 服务器完成支付闭环）
 * 契约不变：适配仅发生在 BFF 层，页面代码零改动。
 */

export type CommerceSource = 'mock' | 'real' | 'auto'

/**
 * 数据源解析。
 *
 * 生产环境（NODE_ENV=production）强制 real：mock/auto 都会在网络抖动时把演示商品
 * 卖给真实顾客，且监控看不到异常（页面 200、订单落到 mock store）。
 * 开发/预发保留 auto 与 mock 以便独立联调。
 */
export function getCommerceSource(): CommerceSource {
  if (process.env.NODE_ENV === 'production') {
    const raw = useRuntimeConfig().commerceSource as string | undefined
    if (raw === 'mock' || raw === 'auto') {
      // 只告警一次，避免每次请求刷日志
      if (!productionSourceWarned) {
        productionSourceWarned = true
        console.warn(`[commerce] 生产环境忽略 NUXT_COMMERCE_SOURCE=${raw}，已强制使用 real 数据源`)
      }
    }
    return 'real'
  }
  const raw = useRuntimeConfig().commerceSource as string | undefined
  return raw === 'real' || raw === 'mock' ? raw : 'auto'
}

let productionSourceWarned = false

import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'

export interface RealFetchResult {
  ok: boolean
  status: number
  body: unknown
  setCookie?: string[]
  networkError?: boolean
}

/** 调用现有后台 storefront 接口（转发 Cookie + requestId；dev 自签名证书开关 NUXT_API_INSECURE_TLS=1） */
export async function commerceRealFetch(
  path: string,
  init: { method?: string; body?: unknown; cookie?: string; rawBody?: string; requestId?: string; authorization?: string; locale?: string } = {},
): Promise<RealFetchResult> {
  if (process.env.NUXT_API_INSECURE_TLS === '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  const apiBase = useRuntimeConfig().apiBase as string
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.cookie) headers.cookie = init.cookie
  if (init.requestId) headers['x-request-id'] = init.requestId
  if (init.authorization) headers.authorization = init.authorization
  if (init.locale) headers['x-store-locale'] = init.locale
  try {
    const res = await rawRequest(`${apiBase}/api/storefront/v1/${path}`, {
      method: init.method || 'GET',
      headers,
      body: init.rawBody ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
    })
    let body: unknown = null
    try {
      body = res.text ? JSON.parse(res.text) : null
    } catch {
      body = { code: res.statusCode, message: res.text.slice(0, 200) }
    }
    return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body, setCookie: res.setCookie }
  } catch (err) {
    console.error(
      `[commerce] fetch ${path} failed:`,
      err instanceof Error ? err.message : err,
      err instanceof Error && err.cause
        ? '| cause: ' + String((err as { cause?: { message?: string } }).cause?.message ?? (err as { cause?: unknown }).cause).slice(0, 160)
        : '',
    )
    return { ok: false, status: 0, body: null, networkError: true }
  }
}

/** 成功响应解包 {code:0,data} → data；其余原样返回 */
export function unwrapEnvelope(body: unknown): unknown {
  if (body && typeof body === 'object' && 'code' in (body as Record<string, unknown>) && 'data' in (body as Record<string, unknown>)) {
    const env = body as { code: number; data: unknown }
    if (env.code === 0) return env.data
  }
  return body
}

// ===================== 字段适配（真实 → 前端契约） =====================

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || fallback)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

function money(amountCents: number, currency: string): Money {
  return { amount: Math.round(num(amountCents)), currency }
}

export function adaptCartView(real: Record<string, unknown>): Cart {
  const currency = str(real.currency, 'USD')
  const items = Array.isArray(real.items) ? (real.items as Record<string, unknown>[]) : []
  const mapped: CartItem[] = items.map((i) => {
    const unit = money(num(i.unitAmountCents), str(i.currency, currency))
    const available = num(i.available, 0)
    return {
      id: num(i.id),
      skuId: num(i.skuId),
      spuId: num(i.spuId),
      title: str(i.title, `sku-${num(i.skuId)}`),
      spec: (i.spec as Record<string, string>) ?? {},
      qty: num(i.qty, 1),
      unit,
      lineTotal: money(unit.amount * num(i.qty, 1), unit.currency),
      sellable: available > 0,
      stockNote: available <= 0 ? 'out-of-stock' : available < 5 ? 'low-stock' : undefined,
    }
  })
  return { token: str(real.token, ''), items: mapped, currency, locale: str(real.locale, ''), itemCount: mapped.reduce((n, i) => n + i.qty, 0) }
}

export function adaptQuote(real: Record<string, unknown>, extraWarnings: string[] = []): Quote {
  const currency = str(real.currency, 'USD')
  const items = Array.isArray(real.items) ? (real.items as Record<string, unknown>[]) : []
  const totals: QuoteTotals = {
    subtotal: money(num(real.subtotalCents), currency),
    discount: money(num(real.discountCents), currency),
    shipping: money(num(real.shippingCents), currency),
    tax: money(num(real.taxCents), currency),
    total: money(num(real.amountCents), currency),
  }
  // 配送档位由服务端按目的地下发（含每档实际运费），前端不再写死 'std'
  const rawOptions = Array.isArray(real.shippingOptions) ? (real.shippingOptions as Record<string, unknown>[]) : []
  const shippingRates = rawOptions.map((o) => ({
    id: str(o.id, 'std'),
    name: str(o.name, 'Standard'),
    amount: money(num(o.amountCents), currency),
    etaDays: str(o.etaDays, ''),
  }))
  // 可配送国家白名单同源下发，前端下拉不再硬编码
  const shippableCountries = Array.isArray(real.shippableCountries)
    ? (real.shippableCountries as unknown[]).filter((c): c is string => typeof c === 'string' && /^[A-Z]{2}$/.test(c))
    : []
  return {
    quoteId: `real-${num(real.version, 0)}`,
    version: num(real.version, 1),
    expiresAt: str(real.expiresAt, new Date(Date.now() + 15 * 60_000).toISOString()),
    currency,
    items: items.map((i) => ({
      skuId: num(i.skuId),
      title: str(i.title, `sku-${num(i.skuId)}`),
      qty: num(i.qty, 1),
      unit: money(num(i.unitAmountCents), currency),
      lineTotal: money(num(i.lineTotalCents), currency),
    })),
    totals,
    shippingRates,
    appliedCoupon: null,
    warnings: extraWarnings,
    // P5-T04：按仓配送承诺透传
    deliveryCommitment: (real.deliveryCommitment as Record<string, unknown> | null | undefined)
      ? {
          warehouseId: num((real.deliveryCommitment as Record<string, unknown>).warehouseId),
          warehouseName: str((real.deliveryCommitment as Record<string, unknown>).warehouseName, ''),
          warehouseType: str((real.deliveryCommitment as Record<string, unknown>).warehouseType, ''),
          deliveryEstimateDays: num((real.deliveryCommitment as Record<string, unknown>).deliveryEstimateDays),
        }
      : null,
    shippableCountries,
  }
}

export function adaptOrderView(real: Record<string, unknown>): OrderDraft & Partial<OrderDetail> {
  const currency = str(real.currency, 'USD')
  const items = Array.isArray(real.items) ? (real.items as Record<string, unknown>[]) : []
  const totals: QuoteTotals = {
    subtotal: money(num(real.subtotalCents), currency),
    discount: money(num(real.discountCents), currency),
    shipping: money(num(real.shippingCents), currency),
    tax: money(num(real.taxCents), currency),
    total: money(num(real.amountCents), currency),
  }
  return {
    id: num(real.id),
    orderNo: str(real.orderNo),
    status: str(real.status, 'created'),
    paymentStatus: str(real.paymentStatus, 'none'),
    currency,
    email: str(real.email, ''),
    createdAt: str(real.createdAt, new Date().toISOString()),
    accessToken: str(real.accessToken, ''),
    totals,
    items: items.map((i) => ({
      skuId: num(i.skuId),
      title: str(i.title, `sku-${num(i.skuId)}`),
      spec: (i.spec as Record<string, string>) ?? {},
      qty: num(i.qty, 1),
      unit: money(num(i.unitAmountCents), currency),
      lineTotal: money(num(i.lineTotalCents), currency),
    })),
    shippingAddress: (real.shippingAddress as Record<string, string>) ?? {},
  }
}

// ===================== mock 支付商模拟器（模拟 provider 服务器发签名 Webhook） =====================

/**
 * 仅当 provider==='mock'：以 PAYMENT_WEBHOOK_SECRET（与后台 config.payment.webhookSecret 同源）对原始 body
 * 做 HMAC-SHA256 签名并投递 payment.succeeded 事件——即模拟「服务商服务器」这一角色，完成沙箱闭环。
 * 真实服务商（stripe 等）接入后此分支不生效（provider !== 'mock'）。
 */
export async function simulateMockProviderWebhook(orderNo: string, providerRef: string, currency: string): Promise<{ delivered: boolean; status: number }> {
  const secret = process.env.NUXT_PAYMENT_WEBHOOK_SECRET || 'storefront_mock_webhook_secret'
  const rawBody = JSON.stringify({ providerRef, orderNo, type: 'payment.succeeded', currency })
  const sig = await digest(secret, rawBody)
  const apiBase = useRuntimeConfig().apiBase as string
  if (process.env.NUXT_API_INSECURE_TLS === '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  try {
    const res = await fetch(`${apiBase}/api/storefront/v1/payments/webhooks/mock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mock-signature': sig },
      body: rawBody,
      signal: AbortSignal.timeout(8000),
    })
    return { delivered: res.ok, status: res.status }
  } catch {
    return { delivered: false, status: 0 }
  }
}

async function digest(secret: string, payload: string): Promise<string> {
  const { createHmac } = await import('node:crypto')
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
}

/** 原生 http/https 请求（显式 rejectUnauthorized，不依赖运行时 env 时序） */
function rawRequest(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ statusCode: number; text: string; setCookie?: string[] }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const isHttps = u.protocol === 'https:'
    const req = (isHttps ? httpsRequest : httpRequest)(
      {
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        method: init.method || 'GET',
        headers: { ...init.headers, 'content-length': init.body ? Buffer.byteLength(init.body) : 0 },
        ...(isHttps ? { rejectUnauthorized: process.env.NUXT_API_INSECURE_TLS !== '1' } : {}),
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString('utf8'),
            setCookie: res.headers['set-cookie'],
          }),
        )
      },
    )
    req.setTimeout(8000, () => req.destroy(new Error('upstream timeout')))
    req.on('error', reject)
    if (init.body) req.write(init.body)
    req.end()
  })
}

// ===================== BFF 转发体契约（唯一构造点，供单测锁定） =====================

/**
 * 报价转发体。
 *
 * 后端 quoteService 依赖 shippingAddress 计运费/税费，依赖 couponCode / pointsToRedeem
 * 计折扣。BFF 曾只转发 cartToken，导致税率、分区运费、优惠券在 C 端全部失效
 * （storefront-ops-audit dim01）。此函数是唯一构造点，字段集合由契约单测锁定。
 */
export interface QuoteForwardInput {
  cartToken?: string
  shippingAddress?: unknown
  shippingRateId?: string
  couponCode?: string
  customerId?: number
  pointsToRedeem?: number
}

export function buildQuoteForwardBody(body: Record<string, unknown>, cartToken?: string): QuoteForwardInput {
  return {
    cartToken,
    shippingAddress: body.shippingAddress,
    shippingRateId: body.shippingRateId as string | undefined,
    couponCode: body.couponCode as string | undefined,
    customerId: body.customerId as number | undefined,
    pointsToRedeem: body.pointsToRedeem as number | undefined,
  }
}

/** 下单转发体：券与积分必须随单下发，否则下单金额与报价不一致 */
export interface OrderForwardInput {
  idempotencyKey: string
  email?: string
  shippingAddress?: unknown
  note?: string
  cartToken?: string
  couponCode?: string
  pointsToRedeem?: number
  shippingRateId?: string
  attribution?: unknown
}

export function buildOrderForwardBody(
  body: Record<string, unknown>,
  cartToken: string | undefined,
  fallbackKey: string,
): OrderForwardInput {
  return {
    idempotencyKey: (body.idempotencyKey as string | undefined) ?? fallbackKey,
    email: body.email as string | undefined,
    shippingAddress: body.address,
    note: body.note as string | undefined,
    cartToken,
    couponCode: body.couponCode as string | undefined,
    pointsToRedeem: body.pointsToRedeem as number | undefined,
    shippingRateId: body.shippingRateId as string | undefined,
    attribution: body.attribution,
  }
}
