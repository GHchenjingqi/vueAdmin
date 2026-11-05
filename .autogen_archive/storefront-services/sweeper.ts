import { getTenantContext } from '../../tenant/context.js'
import Setting from '../../../models/Setting.js'
import { refreshSiteInfo } from '../../../utils/siteCache.js'
import { ShopConfigChange } from '../models/index.js'
import { invalidateCurrencyCache } from './currencyConfig.js'
import { sweepExpiredReservations } from './reservationService.js'
import { sweepTimeoutOrders } from './orderService.js'

/**
 * 补偿与治理 sweeper（P3-T14 / T-05 / P5-T02 定时生效）：
 * - 释放过期库存预占（幂等）
 * - 关闭超时未支付订单（30 分钟 TTL）
 * - 应用到期的币种配置变更（定时生效）+ 回滚能力由 admin API 承接
 * 启动方式：storefront 路由模块加载时 initSweeper()（进程级单例）。
 */

let started = false

export function initSweeper(): void {
  if (started) return
  started = true
  const tick = async (): Promise<void> => {
    try {
      await getTenantContext() // 确保上下文不缺（sweep 内部各自带 fallback tenantId=1）
    } catch {
      /* noop */
    }
    try {
      await sweepExpiredReservations()
    } catch (err) {
      console.error('[sweeper] reservation sweep failed', err)
    }
    try {
      await sweepTimeoutOrders(30)
    } catch (err) {
      console.error('[sweeper] order sweep failed', err)
    }
    try {
      await applyScheduledCurrencyChanges()
    } catch (err) {
      console.error('[sweeper] currency schedule failed', err)
    }
  }
  setInterval(() => void tick(), 60_000)
  void tick()
}

/** 应用到期币种配置（settings key=shop.currency.pending：{config, changeId}） */
export async function applyScheduledCurrencyChanges(): Promise<number> {
  const pendingRaw = await Setting.findOne({ where: { optionKey: 'shop.currency.pending' } })
  if (!pendingRaw?.optionValue) return 0
  let pending: { config: unknown; changeId?: number; effectiveAt: string }
  try {
    pending = JSON.parse(pendingRaw.optionValue)
  } catch {
    await pendingRaw.destroy()
    return 0
  }
  if (new Date(pending.effectiveAt).getTime() > Date.now()) return 0

  const change = pending.changeId ? await ShopConfigChange.findByPk(pending.changeId) : null
  const oldValueRaw = await Setting.findOne({ where: { optionKey: 'shop.currency' } })
  const oldValue = oldValueRaw?.optionValue ? JSON.parse(oldValueRaw.optionValue) : null
  await Setting.upsert({ optionKey: 'shop.currency', optionValue: JSON.stringify(pending.config), autoload: 1 } as never)
  if (change) {
    await change.update({ status: 'applied', appliedAt: new Date() })
  }
  await pendingRaw.destroy()
  invalidateCurrencyCache()
  return 1
}
