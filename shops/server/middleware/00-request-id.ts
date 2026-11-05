import { randomUUID } from 'node:crypto'

/**
 * requestId 贯穿（P1-T09）：
 * - 优先沿用上游 x-request-id（网关/浏览器传入），否则生成 UUID
 * - 写入 event.context.requestId 供所有 BFF 路由引用（错误响应体、上游透传）
 * - 响应头回写 x-request-id，浏览器端可捕获并随反馈提交
 */
export default defineEventHandler((event) => {
  const incoming = getHeader(event, 'x-request-id')
  const rid = incoming && incoming.length >= 8 && incoming.length <= 64 ? incoming : randomUUID()
  event.context.requestId = rid
  setResponseHeader(event, 'x-request-id', rid)
})
