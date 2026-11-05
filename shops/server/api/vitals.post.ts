/**
 * P4-T16：Web Vitals 接收端（BFF）。
 * 记录到进程日志（requestId 关联）；聚合阈值告警与 API P95 属 P4-T13 后端监控范围。
 * 生产可切换为写入时序库/上报聚合服务（X-T06）。
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null)
  if (!body || typeof body !== 'object' || !body.name) {
    setResponseStatus(event, 400)
    return { code: 'BAD_REQUEST', message: 'invalid vitals payload' }
  }
  const b = body as { name: string; value: number; unit: string; rating: string; page: string; id: string }
  console.log(`[vitals] ${b.name}=${b.value}${b.unit === 'ms-x1000' ? 'ms(×1000)' : 'ms'} rating=${b.rating} page=${b.page}`)
  setResponseStatus(event, 204)
  return ''
})
