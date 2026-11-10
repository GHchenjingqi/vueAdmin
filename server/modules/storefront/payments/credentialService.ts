import crypto from 'crypto'
import { Transaction, UniqueConstraintError } from 'sequelize'
import sequelize from '../../../config/database.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopPaymentCredential } from '../../shop/models/index.js'
import { getProviderCredentialDef, REAL_PROVIDER_IDS, type ProviderCredentialDef } from './credentialFields.js'

/**
 * 支付凭据服务：把「密钥/证书」从纯环境变量升级为「后台可配置 + DB 加密存储 + env 兜底」。
 *
 * - 加密：AES-256-GCM，密钥 = SHA-256(PAYMENT_CREDENTIAL_SECRET || JWT_SECRET)；
 *   secretBlob 格式 `${ivHex}:${tagHex}:${cipherBase64}`，带认证标签防止篡改。
 *   生产环境两者皆缺直接 503，禁止用公开可猜的 dev-fallback 密钥加密商户凭据。
 * - 读取优先级：DB 存储凭据 优先于 环境变量（env 仅作「无 DB 记录」时的兜底）。
 * - fail-closed：DB 记录存在却解密失败（密钥轮换/漏配、密文损坏）一律抛 503，绝不静默
 *   回退 env 旧凭据（否则生产订单会悄悄用沙箱商户号收款且被误判为「已配置」）；
 *   仅「表不存在」允许降级为纯 env 部署。
 * - 原子写入：saveCredentials 用事务 + SELECT ... FOR UPDATE 串行化同 (tenantId, provider)
 *   的 read-modify-write，唯一键冲突/死锁回滚重试，避免并发丢更新与首次创建 409。
 * - 租户隔离：凭据按 (tenantId, provider) 唯一；读取 tenant 取 Ambient TenantContext（兜底 1），
 *   与既有 paymentService.tid() 口径一致（单租户场景一致；多租户 Webhook 需另行按单号定位租户）。
 * - 掩码：secret 字段只回显末 4 位，绝不回显明文。
 */

const ALGO = 'aes-256-gcm'
const IV_LEN = 12

function getCipherKey(): Buffer {
  let secret = process.env.PAYMENT_CREDENTIAL_SECRET || process.env.JWT_SECRET
  if (!secret) {
    // 生产环境绝不允许用公开可猜的兜底密钥加密商户凭据（DB 泄露即等同明文）
    if (process.env.NODE_ENV === 'production') {
      throw new AppError(503, 'PAYMENT_CREDENTIAL_SECRET_MISSING: 生产环境必须显式设置 PAYMENT_CREDENTIAL_SECRET')
    }
    secret = 'dev-only-insecure-credential-key'
  }
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

/**
 * 解密失败一律 fail-closed：密文损坏或加密密钥轮换/漏配时，绝不静默回退到 env 里的旧凭据
 * （否则生产订单可能悄悄用沙箱商户号收款，且 assertConfigured 仍误判为「已配置」）。
 */
function decryptCredentials(blob: string): Record<string, string> {
  try {
    const [ivHex, tagHex, dataB64] = blob.split(':')
    if (!ivHex || !tagHex || !dataB64) throw new Error('malformed blob')
    const key = getCipherKey()
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
    return JSON.parse(plain) as Record<string, string>
  } catch (err) {
    // 密钥缺失属于配置错误，保留其明确提示；其余（GCM 认证失败/JSON 损坏）统一包装
    if (err instanceof AppError) throw err
    throw new AppError(
      503,
      'PAYMENT_CREDENTIAL_DECRYPT_FAILED: 凭据密文无法解密，请核对 PAYMENT_CREDENTIAL_SECRET / JWT_SECRET 是否与写入时一致',
    )
  }
}

/** 仅「表不存在」允许降级到纯 env 部署；其余读错误与解密失败一律向上抛出 */
function isMissingTableError(err: unknown): boolean {
  const code = (err as { parent?: { code?: string } })?.parent?.code
  const msg = err instanceof Error ? err.message : String(err)
  return code === 'ER_NO_SUCH_TABLE' || /no such table|doesn't exist/i.test(msg)
}

async function getStoredCredentials(tenantId: number, provider: string): Promise<Record<string, string>> {
  let row: ShopPaymentCredential | null
  try {
    row = await ShopPaymentCredential.findOne({ where: { tenantId, provider } })
  } catch (err) {
    if (isMissingTableError(err)) return {}
    throw err
  }
  if (!row) return {}
  return decryptCredentials(row.secretBlob)
}

/**
 * 保存某租户某通道的凭据：DB 内已存值作为基线，仅用请求里「非空」字段覆盖，
 * 空字符串视为「保留原值」（用于前端密码框留空 = 不修改）。返回最终落库字段集合。
 */
function mergeCredentials(def: ProviderCredentialDef, prev: Record<string, string>, input: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = { ...prev }
  for (const f of def.fields) {
    const v = input[f.key]
    if (typeof v === 'string' && v.length > 0) merged[f.key] = v
  }
  const cleaned: Record<string, string> = {}
  for (const f of def.fields) if (merged[f.key]) cleaned[f.key] = merged[f.key]
  return cleaned
}

/** 单事务内「锁定读 → 合并 → 写回」：行锁把同一 (tenantId, provider) 的 read-modify-write 串行化 */
async function saveCredentialsOnce(
  tenantId: number,
  provider: string,
  def: ProviderCredentialDef,
  input: Record<string, string>,
): Promise<Record<string, string>> {
  return sequelize.transaction(async (tx) => {
    const existing = await ShopPaymentCredential.findOne({
      where: { tenantId, provider },
      transaction: tx,
      lock: Transaction.LOCK.UPDATE,
    })
    const prev = existing ? decryptCredentials(existing.secretBlob) : {}
    const cleaned = mergeCredentials(def, prev, input)
    const blob = encryptCredentials(cleaned)
    if (existing) {
      existing.secretBlob = blob
      await existing.save({ transaction: tx })
    } else {
      await ShopPaymentCredential.create({ tenantId, provider, secretBlob: blob }, { transaction: tx })
    }
    return cleaned
  })
}

/** 并发首次插入的唯一键冲突 / gap-lock 死锁：回滚后开新事务重试即可读到已提交行并合并 */
function isWriteConflict(err: unknown): boolean {
  if (err instanceof UniqueConstraintError) return true
  const code = (err as { parent?: { code?: string } })?.parent?.code
  return code === 'ER_LOCK_DEADLOCK' || /deadlock found/i.test(err instanceof Error ? err.message : String(err))
}

export async function saveCredentials(tenantId: number, provider: string, input: Record<string, string>): Promise<Record<string, string>> {
  const def = getProviderCredentialDef(provider)
  if (!def) throw new Error(`PAYMENT_PROVIDER_NOT_CONFIGURABLE: ${provider} 不支持后台配置凭据`)
  for (let attempt = 0; ; attempt++) {
    try {
      return await saveCredentialsOnce(tenantId, provider, def, input)
    } catch (err) {
      if (attempt < 3 && isWriteConflict(err)) continue
      throw err
    }
  }
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
  /** PEM 证书等多行文本：前端用 textarea 录入 */
  multiline: boolean
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
    return { key: f.key, label: f.label, secret: f.secret, multiline: !!f.multiline, present, value }
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
