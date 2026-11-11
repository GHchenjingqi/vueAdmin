import { mockStore } from '@shared/mock/store'
import { MOCK_BLOG_POSTS, MOCK_REVIEWS } from '@shared/mock/fixtures'
import { adaptCartView, adaptOrderView, adaptQuote, commerceRealFetch, getCommerceSource, simulateMockProviderWebhook, unwrapEnvelope } from '../utils/commerce'

/**
 * BFF 商务路由（cart / checkout / orders）：前端接线层。
 * - auto（默认）：real 优先（转发 cart_token Cookie，字段适配为前端契约），网络级失败回退 mock；
 *   4xx（真实业务错误，如 CURRENCY_CHANGED / 库存不足）原样透传，不吞。
 * - real：仅真实后台；mock：shared/mock 契约层。
 * 私有接口统一 Cache-Control: private, no-store（T-11）。
 */
export default defineEventHandler(async (event) => {
  const url = event.path.replace(/^\/api\//, '')
  const method = event.method
  setResponseHeaders(event, { 'cache-control': 'private, no-store' })

  const source = getCommerceSource()
  const cookie = event.node.req.headers.cookie
  const authorization = event.node.req.headers.authorization as string | undefined
  // P5-T01：从 store_locale cookie 读取当前语言（单源），透传给真实后台/mock（x-store-locale）
  const locale = localeFrom(cookie)

  // ---- GET /api/payments/providers（按后台勾选 + 当前币种筛出的可用支付通道） ----
  // 只放行列表端点；session / webhooks 不走 BFF（webhook 必须保留原始 body 验签）
  if (/^payments\/providers(\?.*)?$/.test(url) && method === 'GET' && source !== 'mock') {
    const res = await commerceRealFetch(url, { method, cookie, requestId: event.context.requestId as string | undefined })
    setResponseStatus(event, res.status)
    return res.ok ? unwrapEnvelope(res.body) : (res.body ?? { code: 'UPSTREAM_ERROR', message: 'payment providers upstream error' })
  }

  // ---- POST /api/payments/capture（回跳后主动确认：PayPal capture 等） ----
  if (/^payments\/capture$/.test(url) && method === 'POST' && source !== 'mock') {
    const body = await readBody(event).catch(() => ({}))
    const res = await commerceRealFetch('payments/capture', { method, body, cookie, requestId: event.context.requestId as string | undefined })
    setResponseStatus(event, res.status)
    return res.ok ? unwrapEnvelope(res.body) : (res.body ?? { code: 'UPSTREAM_ERROR', message: 'payment capture upstream error' })
  }

  // ---- GET /api/payments/order-by-return-token/:token（网关回跳免 token 状态查询） ----
  const rtMatch = /^payments\/order-by-return-token\/([^/?]+)(\?.*)?$/.exec(url)
  if (rtMatch && method === 'GET' && source !== 'mock') {
    const res = await commerceRealFetch(`payments/order-by-return-token/${rtMatch[1]}`, { method, cookie, requestId: event.context.requestId as string | undefined })
    setResponseStatus(event, res.status)
    return res.ok ? unwrapEnvelope(res.body) : (res.body ?? { code: 'UPSTREAM_ERROR', message: 'order status upstream error' })
  }

  // ---- 直通域（并行后端已交付的扩展能力；auto/real 下透传，4xx 业务错误原样返回） ----
  const extMatch = /^(reviews|qa|rma|cms|track|track-event|auth|addresses|referrals|membership|wishlist|view-history|experiments)\b/.exec(url)
  if (extMatch && source !== 'mock') {
    const res = await commerceRealFetch(url, {
      method,
      body: ['POST', 'PATCH', 'PUT'].includes(method) ? await readBody(event).catch(() => undefined) : undefined,
      cookie,
      authorization,
      requestId: event.context.requestId as string | undefined,
    })
    console.log(`[ext] ${method} ${url} -> status=${res.status} networkError=${res.networkError} body=${JSON.stringify(res.body)?.slice(0, 140)}`)
    // P4-T07：reviews 在 auto 网络级失败时回退 mock（与 cart 一致），保证本地演示可见评论/验证购买标记
    if (url.startsWith('reviews') && res.networkError && source === 'auto') {
      return mockHandle(url, method, event, locale)
    }
    setResponseStatus(event, res.status)
    return res.ok ? unwrapEnvelope(res.body) : (res.body ?? { code: 'UPSTREAM_ERROR', message: 'ext upstream error' })
  }

  // ---- GET/PATCH/DELETE /api/addresses/:id（单条：404 业务语义透传；auto 网络失败回退 mock 列表兜底） ----
  const addrIdMatch = /^(addresses\/(\d+))(\?.*)?$/.exec(url)
  if (addrIdMatch && source !== 'mock') {
    const real = await handleReal('addresses/' + addrIdMatch[1], method, event, cookie, authorization, locale)
    if (real !== null) return real
  }

  const isCommercePath = url === 'cart' || url.startsWith('cart/') || url === 'checkout/quote' || url.startsWith('checkout/orders') || url.startsWith('orders/')

  if (isCommercePath && source !== 'mock') {
    const real = await handleReal(url, method, event, cookie, authorization, locale)
    if (real !== null) return real
    // auto + 网络级失败 → 落入 mock；real + 失败已在 handleReal 返回错误
  }

  return mockHandle(url, method, event, locale)
})

/** 真实后台处理；返回 null 表示「网络级失败且允许回退 mock」 */
async function handleReal(
  url: string,
  method: string,
  event: Parameters<Parameters<typeof defineEventHandler>[0]>[0],
  cookie?: string,
  authorization?: string,
  locale?: string,
): Promise<unknown | null> {
  const source = getCommerceSource()
  const requestId = event.context.requestId as string | undefined

  // ---- GET /api/cart ----
  if (url === 'cart' && method === 'GET') {
    const res = await commerceRealFetch('cart', { cookie, requestId, locale })
    if (res.networkError) return source === 'auto' ? null : upstreamFail(event, res)
    if (!res.ok) return upstreamFail(event, res)
    if (res.setCookie) for (const c of res.setCookie) appendHeader(event, 'set-cookie', c)
    return adaptCartView(unwrapEnvelope(res.body) as Record<string, unknown>)
  }

  // ---- POST /api/cart/items ----
  if (url === 'cart/items' && method === 'POST') {
    const body = await readBody(event)
    const res = await commerceRealFetch('cart/items', { method: 'POST', body: { skuId: body.skuId, qty: body.qty }, cookie, authorization, requestId, locale })
    if (res.networkError) return source === 'auto' ? null : upstreamFail(event, res)
    if (!res.ok) return upstreamFail(event, res)
    if (res.setCookie) for (const c of res.setCookie) appendHeader(event, 'set-cookie', c)
    return adaptCartView(unwrapEnvelope(res.body) as Record<string, unknown>)
  }

  // ---- PATCH/DELETE /api/cart/items/:id ----
  const itemMatch = /^cart\/items\/(\d+)$/.exec(url)
  if (itemMatch) {
    const body = method === 'PATCH' ? await readBody(event) : undefined
    const realMethod = method === 'DELETE' ? 'DELETE' : 'PATCH'
    const res = await commerceRealFetch(`cart/items/${itemMatch[1]}`, {
      method: realMethod,
      body: realMethod === 'PATCH' ? { qty: body?.qty } : undefined,
      cookie,
      requestId,
      locale,
    })
    if (res.networkError) return source === 'auto' ? null : upstreamFail(event, res)
    if (!res.ok) return upstreamFail(event, res)
    return adaptCartView(unwrapEnvelope(res.body) as Record<string, unknown>)
  }

  // ---- /api/addresses/:id（单条读写/删除；default 子路由走 ext 直通） ----
  const addrMatch = /^addresses\/(\d+)$/.exec(url)
  if (addrMatch) {
    const real = await commerceRealFetch('addresses/' + addrMatch[1], {
      method,
      body: method === 'PATCH' ? await readBody(event).catch(() => undefined) : undefined,
      cookie,
      authorization,
      requestId: event.context.requestId as string | undefined,
    })
    if (real.networkError) return source === 'auto' ? null : upstreamFail(event, real)
    if (!real.ok) {
      setResponseStatus(event, real.status)
      return real.body ?? { code: 'UPSTREAM_ERROR', message: 'address upstream error' }
    }
    return unwrapEnvelope(real.body)
  }

  // ---- POST /api/checkout/quote ----
  if (url === 'checkout/quote' && method === 'POST') {
    await readBody(event) // 消费 body（真实契约仅需 cartToken；地址/运费/优惠由后台规则表承接）
    const cartToken = cartTokenFrom(cookie)
    const res = await commerceRealFetch('checkout/quote', { method: 'POST', body: { cartToken }, cookie, authorization, requestId })
    if (res.networkError) return source === 'auto' ? null : upstreamFail(event, res)
    if (!res.ok) return upstreamFail(event, res)
    return adaptQuote(unwrapEnvelope(res.body) as Record<string, unknown>)
  }

  // ---- GET /api/checkout/orders（P4-T03：当前顾客订单列表，Bearer 顾客 JWT） ----
  const ordersListMatch = /^checkout\/orders(\?.*)?$/.exec(url)
  if (ordersListMatch && method === 'GET') {
    const q = ordersListMatch[1] ?? ''
    const res = await commerceRealFetch(`checkout/orders${q}`, { cookie, authorization, requestId })
    if (res.networkError) return source === 'auto' ? null : upstreamFail(event, res)
    if (!res.ok) return upstreamFail(event, res)
    const data = unwrapEnvelope(res.body) as { items?: unknown[]; total?: number; page?: number; pageSize?: number }
    return {
      items: (data.items ?? []).map((o) => adaptOrderView(o as Record<string, unknown>)),
      total: data.total ?? 0,
      page: data.page ?? 1,
      pageSize: data.pageSize ?? 10,
    }
  }

  // ---- POST /api/checkout/orders ----
  if (url === 'checkout/orders' && method === 'POST') {
    const body = await readBody(event)
    const cartToken = cartTokenFrom(cookie)
    const res = await commerceRealFetch('checkout/orders', {
      method: 'POST',
      body: {
        idempotencyKey: body.idempotencyKey ?? crypto.randomUUID(),
        email: body.email,
        shippingAddress: body.address,
        note: body.note,
        cartToken,
        // 步骤 6：订单来源归因（site / utm），后端 createOrderSchema 精确剥离并固化进快照
        attribution: body.attribution,
      },
      cookie,
      authorization,
      requestId,
    })
    if (res.networkError) return source === 'auto' ? null : upstreamFail(event, res)
    if (!res.ok) return upstreamFail(event, res)
    const order = adaptOrderView(unwrapEnvelope(res.body) as Record<string, unknown>)
    // 真实契约：accessToken 仅建单响应返回一次 → 下发给前端保存（结果页用 id + accessToken 查询）
    return { ...order, accessToken: order.accessToken || body.idempotencyKey }
  }

  // ---- POST /api/checkout/orders/:orderId/pay?t=<accessToken>（mock provider 模拟器：模拟服务商服务器发签名 Webhook） ----
  const payMatch = /^checkout\/orders\/([^/]+)\/pay(\?.*)?$/.exec(url)
  if (payMatch && method === 'POST') {
    const key = payMatch[1]
    const t = queryToken(url)
    if (!/^\d+$/.test(key)) return null // 非数字（mock 单号）→ mock 层
    // P5-T03：透传可选 provider（如 bnpl），后端经 Provider 注册表做 flag+币种前置校验
    const payBody = await readBody(event).catch(() => undefined)
    const sessionRes = await commerceRealFetch('payments/session', {
      method: 'POST',
      body: { orderId: Number(key), provider: payBody?.provider },
      cookie,
      requestId,
    })
    if (sessionRes.networkError) return source === 'auto' ? null : upstreamFail(event, sessionRes)
    if (!sessionRes.ok) return upstreamFail(event, sessionRes)
    const session = unwrapEnvelope(sessionRes.body) as Record<string, unknown>
    const provider = String(session.provider ?? 'mock')
    if (provider !== 'mock') {
      // 真实网关：透传收银台动作，由前端拉起跳转 / 二维码 / 表单。
      // 不再伪造结果页跳转——订单支付态只能由网关异步通知驱动。
      return {
        sessionUrl: '',
        provider,
        orderNo: String(session.orderNo ?? ''),
        action: String(session.action ?? 'redirect'),
        redirectUrl: session.redirectUrl ? String(session.redirectUrl) : undefined,
        qrCode: session.qrCode ? String(session.qrCode) : undefined,
        form: (session.form ?? undefined) as { url: string; method: 'GET' | 'POST'; fields: Record<string, string> } | undefined,
      }
    }
    // mock：模拟「服务商服务器」向后台投递签名 Webhook（验签/事件去重/幂等/库存实扣全走真实链路）
    const delivered = await simulateMockProviderWebhook(String(session.orderNo), String(session.providerRef), String(session.currency))
    if (!delivered.delivered) {
      setResponseStatus(event, 502)
      return { code: 'PROVIDER_WEBHOOK_FAILED', message: 'mock provider webhook delivery failed' }
    }
    return { sessionUrl: `/checkout/result?id=${key}&t=${t}`, provider }
  }

  // ---- GET /api/orders/:id?t=<accessToken>（防枚举：id+token 双要素，越权/缺 token → 404） ----
  const orderMatch = /^orders\/([^/?]+)(\?.*)?$/.exec(url)
  if (orderMatch && method === 'GET') {
    const key = orderMatch[1]
    const token = queryToken(url)
    if (!/^\d+$/.test(key)) return null // 非数字（mock 单号）→ mock 层
    const res = await commerceRealFetch(`checkout/orders/${key}?accessToken=${encodeURIComponent(token)}`, { cookie, requestId })
    if (res.networkError) return source === 'auto' ? null : upstreamFail(event, res)
    if (!res.ok) {
      // 404/401 统一 404 语义（防枚举：不泄露「存在但 token 错」）
      setResponseStatus(event, 404)
      return { code: 'ORDER_NOT_FOUND', message: 'order not found' }
    }
    const order = adaptOrderView(unwrapEnvelope(res.body) as Record<string, unknown>)
    return { ...order, accessToken: token }
  }

  return null // 不认识的路径 → 交给 mock 层兜底（保持旧行为）
}

function queryToken(url: string): string {
  const q = url.split('?')[1] ?? ''
  return new URLSearchParams(q).get('t') ?? ''
}

function cartTokenFrom(cookie: string | undefined): string | undefined {
  if (!cookie) return undefined
  const m = /(?:^|;\s*)cart_token=([^;]+)/.exec(cookie)
  return m ? decodeURIComponent(m[1]) : undefined
}

/** P5-T01：从 store_locale cookie 提取当前语言（与币种解耦；无效/缺失返回 undefined 交由后端默认） */
function localeFrom(cookie: string | undefined): string | undefined {
  if (!cookie) return undefined
  const m = /(?:^|;\s*)store_locale=([^;]+)/.exec(cookie)
  if (!m) return undefined
  const v = decodeURIComponent(m[1])
  return v === 'en-US' || v === 'zh-CN' ? v : undefined
}

function upstreamFail(event: Parameters<Parameters<typeof defineEventHandler>[0]>[0], res: { status: number; body: unknown }): unknown {
  setResponseStatus(event, res.status || 502)
  return res.body ?? { code: 'UPSTREAM_ERROR', message: 'commerce upstream error', requestId: event.context.requestId }
}

/** mock 契约层（后端不可用时的独立数据源） */
async function mockHandle(url: string, method: string, event: Parameters<Parameters<typeof defineEventHandler>[0]>[0], locale?: string): Promise<unknown> {
  // P4-T07 mock 评论：GET 按 spuId 过滤（isVerified 由后端按订单归属判定；示例混合）；POST 进审核队列
  if (url.startsWith('reviews') && method === 'GET') {
    const spuId = Number(new URLSearchParams(url.split('?')[1] ?? '').get('spuId') ?? 0)
    const items = MOCK_REVIEWS.filter((r) => r.spuId === spuId).map(({ spuId: _s, ...rest }) => rest)
    const count = items.length
    const average = count ? Number((items.reduce((n, r) => n + r.rating, 0) / count).toFixed(1)) : 0
    return { code: 0, data: { items, summary: count ? { average, count } : undefined } }
  }
  if (url === 'reviews' && method === 'POST') {
    const body = await readBody(event).catch(() => ({}))
    return { code: 0, data: { id: Date.now(), spuId: Number(body.spuId), status: 'pending' } }
  }
  // P5-T06 mock 兜底：博客列表/详情（真实模式走 BFF 直通 /storefront/v1/cms/articles）
  if (url === 'cms/articles' && method === 'GET') {
    const page = Number(new URLSearchParams(url.split('?')[1] ?? '').get('page') ?? 1) || 1
    const pageSize = Number(new URLSearchParams(url.split('?')[1] ?? '').get('pageSize') ?? 10) || 10
    const items = MOCK_BLOG_POSTS.slice((page - 1) * pageSize, page * pageSize).map((p) => ({
      id: 0,
      title: p.title,
      slug: p.slug,
      summary: p.excerpt,
      coverImage: null,
      authorName: null,
      tags: null,
      publishedAt: p.date,
    }))
    return { items, total: MOCK_BLOG_POSTS.length, page, pageSize }
  }
  const articleMatch = /^cms\/articles\/([^/?]+)(\?.*)?$/.exec(url)
  if (articleMatch && method === 'GET') {
    const post = MOCK_BLOG_POSTS.find((p) => p.slug === decodeURIComponent(articleMatch[1]))
    if (!post) {
      setResponseStatus(event, 404)
      return { code: 'NOT_FOUND', message: 'post not found' }
    }
    return {
      id: 0,
      title: post.title,
      slug: post.slug,
      summary: post.excerpt,
      coverImage: null,
      authorName: null,
      tags: null,
      publishedAt: post.date,
      content: post.body,
      updatedAt: null,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.excerpt,
        datePublished: post.date,
      },
    }
  }
  if (url === 'cart' && method === 'GET') {
    return mockStore.presentCart(mockStore.getOrCreateCart('guest', 'USD', locale))
  }
  if (url === 'cart/items' && method === 'POST') {
    const body = await readBody(event)
    return mockStore.addItem('guest', 'USD', Number(body.skuId), Number(body.qty ?? 1), locale)
  }
  if (url.startsWith('cart/items/') && method === 'PATCH') {
    const body = await readBody(event)
    return mockStore.updateItem('guest', 'USD', Number(url.split('/')[2]), Number(body.qty), locale)
  }
  if (url.startsWith('cart/items/') && method === 'DELETE') {
    return mockStore.updateItem('guest', 'USD', Number(url.split('/')[2]), 0, locale)
  }
  if (url === 'checkout/quote' && method === 'POST') {
    const body = await readBody(event)
    return mockStore.quote('guest', 'USD', { shippingRateId: body.shippingRateId, couponCode: body.couponCode })
  }
  if (url === 'checkout/orders' && method === 'POST') {
    const body = await readBody(event)
    return mockStore.createOrder('guest', 'USD', (event.node.req.headers['idempotency-key'] as string | undefined) ?? null, {
      email: body.email,
      address: body.address,
      shippingRateId: body.shippingRateId,
      couponCode: body.couponCode,
    })
  }
  // P4-T03 mock 兜底：游客无归属订单列表，返回空分页（真实模式走 BFF 直通）
  if (url.startsWith('checkout/orders') && method === 'GET') {
    return { items: [], total: 0, page: 1, pageSize: 10 }
  }
  // 修复：pay 匹配需剥离 query（?t=accessToken），否则 endsWith('/pay') 恒 false → 404
  const payPath = url.split('?')[0]
  if (payPath.startsWith('checkout/orders/') && payPath.endsWith('/pay') && method === 'POST') {
    const key = payPath.split('/')[2]
    const order = [...mockStore.orders.values()].find((o) => String(o.id) === key || o.orderNo === key)
    if (!order) {
      setResponseStatus(event, 404)
      return { code: 'ORDER_NOT_FOUND', message: 'order not found' }
    }
    return mockStore.pay(order.orderNo)
  }
  if (url.startsWith('orders/') && method === 'GET') {
    const [pathPart, queryPart] = url.split('?')
    const key = pathPart.split('/')[1]
    const token = new URLSearchParams(queryPart ?? '').get('t') ?? ''
    const order = [...mockStore.orders.values()].find((o) => String(o.id) === key || o.orderNo === key)
    if (!order) {
      setResponseStatus(event, 404)
      return { code: 'ORDER_NOT_FOUND', message: 'order not found' }
    }
    try {
      return mockStore.getOrder(order.orderNo, token)
    } catch {
      setResponseStatus(event, 404)
      return { code: 'ORDER_NOT_FOUND', message: 'order not found' }
    }
  }
  // P5-T08 mock 兜底：实验分配 fail-closed control（与真实后端 flag 关闭响应同构，mock 模式自洽无 404）
  const expMatch = /^experiments\/([^/]+)\/assign/.exec(url)
  if (expMatch && method === 'GET') {
    return { code: 0, data: { key: decodeURIComponent(expMatch[1]), enabled: false, variant: 'control', reason: 'feature_disabled' } }
  }
  setResponseStatus(event, 404)
  return { code: 'NOT_FOUND', message: `no handler for ${method} /api/${url}` }
}
