import crypto from 'crypto'
import { getTenantContext } from '../../tenant/context.js'
import { ShopPaymentCredential } from '../../shop/models/index.js'
import { getProviderCredentialDef, REAL_PROVIDER_IDS, type ProviderCredentialDef } from './credentialFields.js'

/**
 * 支付凭据服务：把「密钥/证书」从纯环境变量升级为「后台可配置 + DB 加密存储 + env 兜底」。
 *
 * - 加密：AES-256-GCM，密钥 = SHA-256(PAYMENT_CREDENTIAL_SECRET || JWT_SECRET || dev-fallback)；
 *   secretBlob 格式 `${ivHex}:${tagHex}:${cipherBase64}`，带认证标签防止篡改。
 * - 读取优先级：DB 存储凭据 优先于 环境变量（env 作为兜底，便于灰度/本地开发）。
 * - 租户隔离：凭据按 (tenantId, provider) 唯一；读取 tenant 取 Ambient TenantContext（兜底 1），
 *   与既有 paymentService.tid() 口径一致（单租户场景一致；多租户 Webhook 需另行按单号定位租户）。
 * - 掩码：secret 字段只回显末 4 位，绝不回显明文。
 */

const ALGO = 'aes-256-gcm'
const IV_LEN = 12

function getCipherKey(): Buffer {
  const secret = process.env.PAYMENT_CREDENTIAL_SECRET || process.env.JWT_SECRET || 'dev-only-insecure-credential-key'
  return crypto.createHash('sha256').update(secret).digest()
}

function encryptCredentials(values: Record<string, string>): string {
  const key = getCipherKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(values), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('base64')}`
}

function decryptCredentials(blob: string): Record<string, string> {
  const [ivHex, tagHex, dataB64] = blob.split(':')
  if (!ivHex || !tagHex || !dataB64) throw new Error('PAYMENT_CREDENTIAL_MALFORMED')
  const key = getCipherKey()
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
  return JSON.parse(plain) as Record<string, string>
}

async function getStoredCredentials(tenantId: number, provider: string): Promise<Record<string, string>> {
  try {
    const row = await ShopPaymentCredential.findOne({ where: { tenantId, provider } })
    if (!row) return {}
    return decryptCredentials(row.secretBlob)
  } catch {
    // 表未初始化或读取异常时降级为 env 兜底，不阻断既有 env-only 链路
    return {}
  }
}

/**
 * 保存某租户某通道的凭据：DB 内已存值作为基线，仅用请求里「非空」字段覆盖，
 * 空字符串视为「保留原值」（用于前端密码框留空 = 不修改）。返回最终落库字段集合。
 */
export async function saveCredentials(tenantId: number, provider: string, input: Record<string, string>): Promise<Record<string, string>> {
  const def = getProviderCredentialDef(provider)
  if (!def) throw new Error(`PAYMENT_PROVIDER_NOT_CONFIGURABLE: ${provider} 不支持后台配置凭据`)
  const existing = await ShopPaymentCredential.findOne({ where: { tenantId, provider } })
  const prev = existing ? decryptCredentials(existing.secretBlob) : {}
  const merged: Record<string, string> = { ...prev }
  for (const f of def.fields) {
    const v = input[f.key]
    if (typeof v === 'string' && v.length > 0) merged[f.key] = v
  }
  const cleaned: Record<string, string> = {}
  for (const f of def.fields) if (merged[f.key]) cleaned[f.key] = merged[f.key]
  const blob = encryptCredentials(cleaned)
  if (existing) {
    existing.secretBlob = blob
    await existing.save()
  } else {
    await ShopPaymentCredential.create({ tenantId, provider, secretBlob: blob })
  }
  return cleaned
}

/**
 * 解析某通道最终生效配置：DB 存储凭据优先，env 变量兜底。
 * 非真实通道（mock/bnpl）返回空对象（无需外部凭据）。
 */
export async function resolveGatewayConfig(providerId: string): Promise<Record<string, string>> {
  const def = getProviderCredentialDef(providerId)
  if (!def) return {}
  const tenantId = getTenantContext()?.tenantId ?? 1
  const stored = await getStoredCredentials(tenantId, providerId)
  const out: Record<string, string> = {}
  for (const f of def.fields) {
    out[f.key] = stored[f.key] || process.env[`${def.prefix}_${f.key}`] || ''
  }
  return out
}

export interface CredentialFieldView {
  key: string
  label: string
  secret: boolean
  present: boolean
  /** secret 仅末 4 位掩码；非 secret 回显明文（均为非敏感信息，如网关地址/商户号） */
  value: string
}

export async function maskCredentials(tenantId: number, provider: string): Promise<CredentialFieldView[]> {
  const def = getProviderCredentialDef(provider)
  if (!def) return []
  const stored = await getStoredCredentials(tenantId, provider)
  return def.fields.map((f) => {
    const v = stored[f.key] || process.env[`${def.prefix}_${f.key}`] || ''
    const present = !!v
    const value = f.secret ? (present ? `****${v.slice(-4)}` : '') : v
    return { key: f.key, label: f.label, secret: f.secret, present, value }
  })
}

const PROVIDER_LABELS: Record<string, string> = {
  paypal: 'PayPal',
  wechat: '微信支付',
  alipay: '支付宝',
  unionpay: '银联 / 云闪付',
}

export interface ProviderCredentialView {
  id: string
  label: string
  configured: boolean
  fields: CredentialFieldView[]
}

/** 后台凭据配置页：列出全部真实通道、各字段是否已配置（掩码）、整体是否就绪 */
export async function listCredentialProviders(tenantId: number): Promise<ProviderCredentialView[]> {
  const views = await Promise.all(
    REAL_PROVIDER_IDS.map(async (id) => {
      const def: ProviderCredentialDef = getProviderCredentialDef(id)!
      const fields = await maskCredentials(tenantId, id)
      return {
        id,
        label: PROVIDER_LABELS[id] ?? id,
        configured: fields.length > 0 && fields.every((f) => f.present),
        fields,
      }
    }),
  )
  return views
}
