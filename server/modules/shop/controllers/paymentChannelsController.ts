import type { NextFunction, Request, Response } from 'express'
import { getChannelConfig, saveChannelConfig, CHANNEL_IDS } from '../../storefront/payments/channelConfig.js'
import { getActiveCurrency } from '../../storefront/services/currencyConfig.js'
import { getProvider, PROVIDERS } from '../../storefront/payments/providerRegistry.js'
import { getGateway } from '../../storefront/payments/gatewayRegistry.js'
import { listCredentialProviders, saveCredentials } from '../../storefront/payments/credentialService.js'
import { REAL_PROVIDER_IDS } from '../../storefront/payments/credentialFields.js'
import { getTenantContext } from '../../../modules/tenant/context.js'
import { record as recordAudit, recordAdminAction } from '../services/auditLogService.js'
import { checkKeyedRateLimit } from '../../../middleware/rateLimiter.js'
import { AppError } from '../../../middleware/errorHandler.js'

/** 凭据接口限流：读宽松（掩码）、写严格（防暴力试错/刷写），按租户 + IP 隔离 */
const CRED_LIMITS = {
  read: { windowMs: 60 * 1000, max: 60 },
  write: { windowMs: 15 * 60 * 1000, max: 20 },
} as const

async function enforceCredentialRateLimit(req: Request, kind: keyof typeof CRED_LIMITS, tenantId: number): Promise<void> {
  const { windowMs, max } = CRED_LIMITS[kind]
  const key = `rate:cred:${kind}:${tenantId}:${req.ip ?? 'unknown'}`
  const r = await checkKeyedRateLimit(key, windowMs, max)
  if (!r.allowed) throw new AppError(429, `RATE_LIMITED: 操作过于频繁，请 ${r.retryAfter ?? Math.ceil(windowMs / 1000)}s 后重试`)
}

/**
 * 支付通道后台配置（P5-T03 扩展）：
 * - 勾选决定前台展示与可结算通道；保存即生效并主动失效缓存；
 * - 密钥/证书由「后台加密配置（DB）为主、环境变量兜底」，此处只回显「是否已配置」，绝不返回密钥明文；
 * - 银联 supportedCurrencies='*'，任何币种都展示（外币按订单快照原样送网关）。
 */

async function credentialsState(id: string): Promise<{ configured: boolean; missing?: string }> {
  const def = getProvider(id)
  if (!def?.real) return { configured: true }
  try {
    await getGateway(id)?.assertConfigured()
    return { configured: true }
  } catch (err) {
    return { configured: false, missing: err instanceof Error ? err.message : '未知错误' }
  }
}

export const getChannels = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cfg = await getChannelConfig()
    const currency = (await getActiveCurrency().catch(() => null))?.code ?? null
    res.json({
      code: 0,
      data: {
        configured: cfg.configured,
        enabled: cfg.enabled,
        accounts: cfg.accounts,
        activeCurrency: currency,
        channels: await Promise.all(
          PROVIDERS.map(async (p) => ({
            id: p.id,
            label: p.label,
            kind: p.kind,
            supportedCurrencies: p.supportedCurrencies === '*' ? ['*'] : p.supportedCurrencies,
            allCurrencies: p.supportedCurrencies === '*',
            enabled: cfg.enabled.includes(p.id),
            ...(await credentialsState(p.id)),
          })),
        ),
      },
    })
  } catch (err) {
    next(err)
  }
}

export const updateChannels = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { enabled, accounts } = req.body as { enabled: string[]; accounts?: Record<string, Record<string, string>> }
    const saved = await saveChannelConfig({ enabled, accounts })
    // 通道开关决定哪些收款入口可用：留痕「谁/何时/启用了哪些通道」，不记 accounts 的值
    await recordAdminAction(req, 'payment.channels_updated', 'config', null, {
      enabled,
      accountProviders: accounts ? Object.keys(accounts) : [],
    })
    res.json({ code: 0, data: saved })
  } catch (err) {
    next(err)
  }
}

/** 诊断：按当前启用币种列出实际可选通道，便于后台核对「勾选 + 凭据 + 币种」三者一致 */
export const channelState = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currency = typeof req.query.currency === 'string' ? req.query.currency.toUpperCase() : (await getActiveCurrency()).code
    const { listProviders } = await import('../../storefront/payments/providerRegistry.js')
    const usable = await listProviders(currency)
    const cfg = await getChannelConfig()
    res.json({
      code: 0,
      data: {
        currency,
        legacyMode: !cfg.configured,
        usable: await Promise.all(
          usable.map(async (p) => ({ id: p.id, label: p.label, ...(await credentialsState(p.id)) })),
        ),
        knownIds: CHANNEL_IDS,
      },
    })
  } catch (err) {
    next(err instanceof AppError ? err : err)
  }
}

/** 读取全部真实通道的凭据配置状态（掩码，绝不回显明文；secret 仅末 4 位） */
export const getCredentials = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = getTenantContext()?.tenantId ?? 1
    await enforceCredentialRateLimit(req, 'read', tenantId)
    const providers = await listCredentialProviders(tenantId)
    res.json({ code: 0, data: { providers } })
  } catch (err) {
    next(err)
  }
}

/** 保存某通道凭据：加密落库（DB 主、env 兜底）；空字符串字段表示保留原值，不覆盖 */
export const updateCredentials = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider, credentials } = req.body as { provider: string; credentials?: Record<string, string> }
    if (!REAL_PROVIDER_IDS.includes(provider)) {
      throw new AppError(400, `PAYMENT_PROVIDER_NOT_CONFIGURABLE: ${provider} 不支持后台配置凭据`)
    }
    const tenantId = getTenantContext()?.tenantId ?? 1
    await enforceCredentialRateLimit(req, 'write', tenantId)
    const payload = credentials ?? {}
    const saved = await saveCredentials(tenantId, provider, payload)
    // 改收款凭据属高敏操作：留痕「谁/何时/改了哪些字段」，绝不写入任何凭据值（明文或掩码）
    const user = (req as unknown as { user?: { id?: number; username?: string } }).user
    await recordAudit({
      tenantId,
      actorType: 'admin',
      actorId: user?.id ?? null,
      action: 'payment.credentials_updated',
      entityType: 'config',
      beforeState: { provider, requestedKeys: Object.keys(payload), operator: user?.username ?? null },
      afterState: { provider, configuredKeys: Object.keys(saved) },
    })
    res.json({ code: 0, data: { provider, configuredKeys: Object.keys(saved) } })
  } catch (err) {
    next(err)
  }
}
