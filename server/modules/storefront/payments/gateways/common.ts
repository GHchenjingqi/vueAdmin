import crypto from 'crypto'
import { AppError } from '../../../../middleware/errorHandler.js'

/** 网关公共工具：环境变量读取、fail-closed、RSA2 签名验签、AES-GCM 解密 */

export function envConfig(prefix: string, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of keys) out[key] = process.env[`${prefix}_${key}`] ?? ''
  return out
}

export function assertConfig(config: Record<string, string>, id: string): void {
  const missing = Object.entries(config)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (missing.length) throw new AppError(503, `PAYMENT_GATEWAY_NOT_CONFIGURED: ${id} 缺少配置 ${missing.join(', ')}`)
}

export function rsaSign(privateKeyPem: string, data: string): string {
  return crypto.createSign('RSA-SHA256').update(data, 'utf8').sign(privateKeyPem, 'base64')
}

export function rsaVerify(publicKeyPem: string, data: string, signatureBase64: string): boolean {
  try {
    return crypto.createVerify('RSA-SHA256').update(data, 'utf8').verify(publicKeyPem, Buffer.from(signatureBase64, 'base64'))
  } catch {
    return false
  }
}

/** 微信支付 APIv3 通知体解密（AEAD_AES_256_GCM） */
export function aesGcmDecrypt(apiV3Key: string, ciphertext: string, nonce: string, associatedData: string): Record<string, unknown> {
  const buf = Buffer.from(ciphertext, 'base64')
  const authTag = buf.subarray(buf.length - 16)
  const data = buf.subarray(0, buf.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(nonce, 'utf8'))
  decipher.setAuthTag(authTag)
  decipher.setAAD(Buffer.from(associatedData, 'utf8'))
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  return JSON.parse(plain) as Record<string, unknown>
}

/** 按 key 字典序拼 k=v&...（支付宝 / 银联签名串） */
export function sortedKv(fields: Record<string, string>, exclude: string[] = []): string {
  return Object.keys(fields)
    .filter((k) => !exclude.includes(k) && fields[k] !== '' && fields[k] != null)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('&')
}

export function parseForm(raw: Buffer | string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(raw.toString('utf8'))) out[k] = v
  return out
}

export function header(headers: Record<string, string | string[] | undefined>, key: string): string {
  const v = headers[key.toLowerCase()]
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

export function failVerify(): never {
  throw new AppError(401, '签名无效')
}

export function baseUrl(): string {
  return (process.env.PAYMENT_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
}

export function notifyUrl(provider: string): string {
  const base = baseUrl()
  if (!base) throw new AppError(503, `PAYMENT_GATEWAY_NOT_CONFIGURED: PAYMENT_PUBLIC_BASE_URL 未配置（${provider} 回调地址）`)
  return `${base}/api/storefront/v1/payments/webhooks/${provider}`
}

export function money(cents: number): string {
  return (cents / 100).toFixed(2)
}

export async function fetchJson<T = Record<string, unknown>>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) throw new AppError(502, `PAYMENT_GATEWAY_FAILED: ${res.status} ${typeof body === 'string' ? body : JSON.stringify(body)}`)
  return body as T
}
