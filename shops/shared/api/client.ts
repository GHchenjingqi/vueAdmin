import { randomUUID } from 'node:crypto'
import type { ApiErrorBody } from '../types/api'

/**
 * 统一 API Client（P1-T07）：超时、5xx 有限重试、4xx 不重试、错误统一转 ApiError（含 requestId 贯穿）。
 * BFF 侧使用；浏览器侧通过同源 BFF 调用。
 */
export class ApiClientError extends Error {
  code: string
  status: number
  requestId?: string

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || 'request failed')
    this.name = 'ApiClientError'
    this.code = body.code
    this.status = status
    this.requestId = body.requestId
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  timeoutMs?: number
  retries?: number
  headers?: Record<string, string>
  requestId?: string
}

export async function apiFetch<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = 8000, retries = 1, headers = {}, requestId } = opts
  const rid = requestId || randomUUID()
  const doFetch = async (): Promise<Response> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      return await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', 'x-request-id': rid, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  let lastErr: unknown = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await doFetch()
      const text = await res.text()
      const data = text ? (JSON.parse(text) as unknown) : null
      if (!res.ok) {
        const errBody = (data as ApiErrorBody) || { code: 'UPSTREAM_ERROR', message: `HTTP ${res.status}` }
        // 5xx 有限重试；4xx 不重试（P1-T07）
        if (res.status >= 500 && attempt < retries) {
          lastErr = new ApiClientError(res.status, errBody)
          continue
        }
        throw new ApiClientError(res.status, errBody)
      }
      return data as T
    } catch (err) {
      if (err instanceof ApiClientError) throw err
      lastErr = err
      if (attempt >= retries) break
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('api request failed')
}
