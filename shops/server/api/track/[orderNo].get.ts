import { commerceRealFetch, unwrapEnvelope } from '../../utils/commerce'

/**
 * P4-T04：物流轨迹 BFF 接线（真实后台 GET /track/:orderNo?accessToken=）。
 *
 * 防枚举（与后端一致）：订单号 + 访问凭证双要素，缺失或不匹配统一 404，
 * 不泄漏「订单是否存在 / 是否已发货」。前端用 `t` 传递凭证（与结果页 URL 一致）。
 * 私有响应一律 `private, no-store`（T-11），轨迹页不进 CDN 缓存。
 */
export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'cache-control': 'private, no-store' })
  const orderNo = String(getRouterParam(event, 'orderNo') ?? '')
  const token = String(getQuery(event).t ?? '')

  const notFound = () => {
    setResponseStatus(event, 404)
    return { code: 'ORDER_NOT_FOUND', message: 'order not found' }
  }
  if (!orderNo || !token) return notFound()

  const res = await commerceRealFetch(`track/${encodeURIComponent(orderNo)}?accessToken=${encodeURIComponent(token)}`, {
    requestId: event.context.requestId as string | undefined,
  })
  if (res.networkError) {
    setResponseStatus(event, 502)
    return { code: 'UPSTREAM_ERROR', message: 'tracking upstream unavailable' }
  }
  if (!res.ok) return notFound()
  return unwrapEnvelope(res.body)
})
