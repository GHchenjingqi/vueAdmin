import { scrub } from '@shared/errors/report'

/**
 * P1-T10：BFF 错误日志接收端（服务端二次脱敏后输出到进程日志，requestId 关联）。
 * 生产可替换为 Sentry transport（SENTRY_DSN 配置后切换，见 DEPLOYMENT_RUNBOOK）。
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null)
  if (!body || typeof body !== 'object') {
    setResponseStatus(event, 400)
    return { code: 'BAD_REQUEST', message: 'invalid error report' }
  }
  const b = body as { message?: string; stack?: string; source?: string; url?: string; requestId?: string; ts?: string }
  const rid = (event.context.requestId as string | undefined) ?? b.requestId
  // 服务端二次脱敏（纵深防御：客户端已清洗，这里再过一遍）
  const message = scrub(String(b.message ?? '')).slice(0, 500)
  const stack = b.stack ? scrub(String(b.stack)).slice(0, 1500) : undefined
  console.log(`[client-error] rid=${rid} src=${b.source} url=${b.url} msg=${message}${stack ? '\n  stack: ' + stack.replace(/\n/g, '\n  ') : ''}`)
  setResponseStatus(event, 204)
  return ''
})
