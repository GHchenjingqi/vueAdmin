import { commerceRealFetch, unwrapEnvelope } from '../../utils/commerce'

/**
 * 到货通知订阅 BFF（PLAN 4.3）
 *
 * 后端 `POST /restock/subscribe` 与 `ShopRestockSubscription` 早已实现，
 * 但 C 端没有任何调用方（`shops/pages`、`shops/components` 检索 `restock` 零命中），
 * 缺货商品页因此没有「留下邮箱等补货」入口 —— 缺货即流失。
 *
 * 契约：{ email, skuId, locale? } → 后端按 (tenantId, skuId, email) 幂等落库。
 */
export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'cache-control': 'private, no-store' })

  if (event.method !== 'POST') {
    setResponseStatus(event, 405)
    return { code: 'METHOD_NOT_ALLOWED', message: 'use POST' }
  }

  const body = await readBody(event).catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const skuId = Number(body?.skuId)

  // 先做本地形状校验：避免把明显非法的请求打到后端再返回 400，
  // 也防止 undefined 进入 fetch body 造成后端口径歧义。
  if (!email || !email.includes('@')) {
    setResponseStatus(event, 400)
    return { code: 'EMAIL_INVALID', message: '请填写有效邮箱' }
  }
  if (!Number.isInteger(skuId) || skuId <= 0) {
    setResponseStatus(event, 400)
    return { code: 'SKU_REQUIRED', message: '缺少有效的 skuId' }
  }

  const res = await commerceRealFetch('restock/subscribe', {
    method: 'POST',
    body: { email, skuId, locale: typeof body?.locale === 'string' ? body.locale : undefined },
    requestId: event.context.requestId as string | undefined,
  })

  if (res.networkError) {
    setResponseStatus(event, 502)
    return { code: 'UPSTREAM_ERROR', message: 'restock subscribe failed' }
  }
  setResponseStatus(event, res.status)
  return res.ok ? unwrapEnvelope(res.body) : (res.body ?? { code: 'UPSTREAM_ERROR', message: 'restock subscribe failed' })
})
