import { Op } from 'sequelize'
import { getTenantContext } from '../../tenant/context.js'
import { ShopOrderPayment } from '../../shop/models/index.js'
import * as reservationService from '../../shop/services/reservationService.js'
import { getGateway } from '../payments/gatewayRegistry.js'
import { applyGatewayEvent } from './paymentService.js'
import { logInfo } from '../../../utils/fileLogger.js'

/**
 * 支付对账/补单调度器（A2 收口项之一）。
 *
 * 背景：部分网关（PayPal 等）以异步通知为准，但通知可能延迟/丢失；
 * 用户也可能在未支付的收银台停留后离开。本调度器周期性扫描仍处于
 * `initiated` 的支付单据：
 *  - 若网关适配器实现了 query()，则主动查单：成功→走统一事件应用，失败/过期→关单；
 *  - 若网关不支持主动查单，则按超时硬上限直接关单（释放库存预占）；
 *  - 查单结果为空（进行中）且未超硬上限时，留待下一轮扫描。
 *
 * 关单：标记 payment.status='expired' 并释放该订单的库存预占（幂等）。
 */

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000 // 30 分钟：超过此时间仍未确认即视为放弃
const HARD_CAP_MS = 24 * 60 * 60 * 1000 // 24 小时：无论如何强制关单
const BATCH = 50

function timeoutMs(): number {
  const v = Number(process.env.PAYMENT_RECONCILE_TIMEOUT_MS)
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TIMEOUT_MS
}

export async function reconcilePayments(): Promise<number> {
  const tId = getTenantContext()?.tenantId ?? 1
  const now = Date.now()
  const to = now - timeoutMs()
  const cap = now - HARD_CAP_MS

  const rows = await ShopOrderPayment.findAll({
    where: {
      tenantId: tId,
      status: 'initiated',
      createdAt: { [Op.lt]: new Date(to) },
    },
    limit: BATCH,
  })
  if (rows.length === 0) return 0

  let closed = 0
  for (const row of rows) {
    const gateway = getGateway(row.provider)
    let done = false

    if (gateway?.query) {
      try {
        const event = await gateway.query({
          orderNo: row.orderNo,
          providerRef: row.providerRef,
          gatewayRef: row.gatewayRef ?? undefined,
          config: { providerId: row.provider },
        })
        if (event) {
          const result = await applyGatewayEvent(row.provider, event)
          if (result.ok) closed++
          done = true
        }
      } catch (err) {
        logInfo(`[reconcile] 查单异常 ${row.provider} ${row.orderNo}: ${(err as Error).message}`)
      }
    }

    // 不支持查单，或查单结果为空且已超硬上限 → 关单
    if (!done) {
      const created = row.createdAt ? new Date(row.createdAt).getTime() : 0
      if (!gateway?.query || created < cap) {
        await row.update({ status: 'expired' } as never)
        await reservationService.releaseReservation(row.orderNo).catch(() => null)
        closed++
      }
    }
  }
  return closed
}

/** 注册周期性对账扫描；返回停止函数。intervalMs 默认 5 分钟。 */
export function startPaymentReconcileScanner(intervalMs = 5 * 60 * 1000): () => void {
  const timer = setInterval(async () => {
    try {
      const n = await reconcilePayments()
      if (n > 0) logInfo(`[reconcile] 关单/补单 ${n} 笔`)
    } catch (err) {
      logInfo(`[reconcile] 扫描失败: ${(err as Error).message}`)
    }
  }, intervalMs)
  return () => clearInterval(timer)
}
