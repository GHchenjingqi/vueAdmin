import type { NextFunction, Request, Response } from 'express'
import { getChannelConfig, saveChannelConfig, CHANNEL_IDS } from '../../storefront/payments/channelConfig.js'
import { getActiveCurrency } from '../../storefront/services/currencyConfig.js'
import { getProvider, PROVIDERS } from '../../storefront/payments/providerRegistry.js'
import { getGateway } from '../../storefront/payments/gatewayRegistry.js'
import { AppError } from '../../../middleware/errorHandler.js'

/**
 * 支付通道后台配置（P5-T03 扩展）：
 * - 勾选决定前台展示与可结算通道；保存即生效并主动失效缓存；
 * - 密钥/证书一律走环境变量，此处只回显「是否已配置」，绝不返回密钥值；
 * - 银联 supportedCurrencies='*'，任何币种都展示（外币按订单快照原样送网关）。
 */

function credentialsState(id: string): { configured: boolean; missing?: string } {
  const def = getProvider(id)
  if (!def?.real) return { configured: true }
  try {
    getGateway(id)?.assertConfigured()
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
        channels: PROVIDERS.map((p) => ({
          id: p.id,
          label: p.label,
          kind: p.kind,
          supportedCurrencies: p.supportedCurrencies === '*' ? ['*'] : p.supportedCurrencies,
          allCurrencies: p.supportedCurrencies === '*',
          enabled: cfg.enabled.includes(p.id),
          ...credentialsState(p.id),
        })),
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
        usable: usable.map((p) => ({ id: p.id, label: p.label, ...credentialsState(p.id) })),
        knownIds: CHANNEL_IDS,
      },
    })
  } catch (err) {
    next(err instanceof AppError ? err : err)
  }
}
