import { commerceRealFetch, unwrapEnvelope } from '../../utils/commerce'

/**
 * P4-T09：邮件订阅 BFF 接线（真实后台 /newsletter/*）。
 * subscribe：{email, source?, locale?}（source 标记订阅入口，明确同意记录）
 * unsubscribe：GET ?token=（邮件退订链接落地页用）
 */
export default defineEventHandler(async (event) => {
  const path = event.path.replace(/^\/api\/newsletter\//, '')
  const method = event.method
  setResponseHeaders(event, { 'cache-control': 'private, no-store' })

  if (path === 'subscribe' && method === 'POST') {
    const body = await readBody(event)
    const res = await commerceRealFetch('newsletter/subscribe', {
      method: 'POST',
      body: { email: body.email, source: body.source || 'footer', locale: body.locale },
      requestId: event.context.requestId as string | undefined,
    })
    setResponseStatus(event, res.status)
    return res.ok ? unwrapEnvelope(res.body) : (res.body ?? { code: 'UPSTREAM_ERROR', message: 'subscribe failed' })
  }

  if (path === 'unsubscribe' && method === 'GET') {
    const token = String(getQuery(event).token ?? '')
    const res = await commerceRealFetch(`newsletter/unsubscribe?token=${encodeURIComponent(token)}`, {
      requestId: event.context.requestId as string | undefined,
    })
    setResponseStatus(event, res.status)
    return res.ok ? unwrapEnvelope(res.body) : (res.body ?? { code: 'UPSTREAM_ERROR', message: 'unsubscribe failed' })
  }

  setResponseStatus(event, 404)
  return { code: 'NOT_FOUND', message: 'unknown newsletter path' }
})
