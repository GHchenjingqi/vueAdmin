import { commerceRealFetch, unwrapEnvelope } from '../utils/commerce'

/**
 * P4-T10/T11：服务端 CAPI 埋点 BFF 接线（真实后台 POST /track-event）。
 *
 * - 浏览器只调同源 `/api/track-event`，由本层精确剥离字段后转发后台；
 * - 后端负责事件白名单、(tenantId,eventId) 幂等、同意门控、
 *   purchase/refund 订单快照事实校准与 CAPI 派发；
 * - 埋点是尽力而为：上游网络故障返回 200 `accepted:false` 静默降级，
 *   绝不把第三方/后台故障抛给 C 端页面或打断结账流程。
 */
export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { 'cache-control': 'private, no-store' })
  const body = (await readBody(event)) as Record<string, unknown>
  const payload = {
    eventId: body.eventId,
    eventName: body.eventName,
    consent: body.consent,
    sessionId: body.sessionId,
    params: body.params,
  }
  const res = await commerceRealFetch('track-event', {
    method: 'POST',
    body: payload,
    requestId: event.context.requestId as string | undefined,
  })
  if (res.networkError) {
    return { code: 0, data: { accepted: false, dispatchStatus: 'upstream_unavailable' } }
  }
  setResponseStatus(event, res.status)
  return res.ok ? unwrapEnvelope(res.body) : (res.body ?? { code: 'UPSTREAM_ERROR', message: 'track-event failed' })
})
