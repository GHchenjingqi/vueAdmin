import { Op, fn, col } from 'sequelize'
import { getTenantContext, runInTenant } from '../../tenant/context.js'
import { ShopOrder, ShopOrderPayment } from '../../shop/models/index.js'
import * as reservationService from '../../shop/services/reservationService.js'
import { releaseCoupon } from './couponService.js'
import { getGateway } from '../payments/gatewayRegistry.js'
import { PROVIDERS } from '../payments/providerRegistry.js'
import { applyGatewayEvent } from './paymentService.js'
import { logInfo } from '../../../utils/fileLogger.js'

/**
 * 支付对账/补单调度器（A2 收口项之一）。
 *
 * 背景：部分网关（PayPal 等）以异步通知为准，但通知可能延迟/丢失；
 * 用户也可能在未支付的收银台停留后离开。本调度器周期性扫描两类待终态单据：
 *  - `initiated`：超时后若网关实现了 query() 则主动查单（成功→统一事件应用，
 *    失败/过期→关单），不支持查单或已超硬上限则直接关单；
 *  - `failed`：支付失败后允许换方式重试，故保留券占用，但超过宽限期（硬上限）
 *    仍未重试成功的单据必须关单，否则券名额与库存预占永久悬挂。
 *
 * 关单只标记「这张支付单据」终态；只有确认订单未成交、且同单没有其它在途支付
 * 单据时，才回退订单级资源（库存预占 + 优惠券占用），二者均幂等。
 */

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000 // 30 分钟：超过此时间仍未确认即视为放弃
const HARD_CAP_MS = 24 * 60 * 60 * 1000 // 24 小时：无论如何强制关单；也是 failed 单据的重试宽限期
const BATCH = 50

/** 仍可能成交的支付单据状态：存在同单活跃单据时不得回退订单级资源 */
const LIVE_PAYMENT_STATUSES = ['initiated', 'authorized', 'captured']
/** 已结算订单的支付态：与 paymentService.SETTLED_PAYMENT_STATUSES 同口径 */
const SETTLED_ORDER_STATUSES = new Set(['captured', 'refunding', 'refunded'])

function timeoutMs(): number {
  const v = Number(process.env.PAYMENT_RECONCILE_TIMEOUT_MS)
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TIMEOUT_MS
}

/**
 * 关单能否顺带释放订单级资源。
 *
 * 同一订单可以有多张支付单据（换通道重试 / 前端重复建会话）。若只看「这张单据
 * 超时」就释放，已支付订单的优惠券流水会被删掉、或正在重试的订单名额被别人占走。
 */
async function canReleaseOrderResources(row: ShopOrderPayment, tId: number): Promise<boolean> {
  const order = await ShopOrder.findOne({
    where: { orderNo: row.orderNo, tenantId: tId } as never,
    attributes: ['id', 'status', 'paymentStatus'],
  } as never)
  if (order && (SETTLED_ORDER_STATUSES.has(order.paymentStatus ?? '') || order.status === 'paid')) return false

  const live = await ShopOrderPayment.count({
    where: {
      tenantId: tId,
      orderNo: row.orderNo,
      id: { [Op.ne]: row.id },
      status: { [Op.in]: LIVE_PAYMENT_STATUSES },
    } as never,
  })
  return live === 0
}

/**
 * 关单：CAS 认领终态（并发扫描器只有一个赢家），再按守卫释放订单级资源。
 * 释放失败必须回滚终态，否则这张单据再也不会被扫描到，库存锁与券占用永久悬挂。
 */
async function closePayment(row: ShopOrderPayment, tId: number): Promise<boolean> {
  const original = row.status
  const [claimed] = await ShopOrderPayment.update({ status: 'expired' } as never, {
    where: { id: row.id, tenantId: tId, status: original } as never,
  })
  if (claimed !== 1) return false

  if (!(await canReleaseOrderResources(row, tId))) return true

  try {
    await reservationService.releaseReservation(row.orderNo)
    await releaseCoupon(row.orderNo)
  } catch (err) {
    await ShopOrderPayment.update({ status: original } as never, {
      where: { id: row.id, tenantId: tId, status: 'expired' } as never,
    })
    logInfo(`[reconcile] 订单资源释放失败，单据回滚待重试 ${row.orderNo}: ${(err as Error).message}`)
    return false
  }
  return true
}

/** 当前注册通道中实现了主动查单的 provider（其余通道超时即可直接关单） */
function queryCapableProviders(): string[] {
  return PROVIDERS.map((p) => p.id).filter((id) => !!getGateway(id)?.query)
}

/**
 * 分两批取数，避免「查单长期无结果」的单据占满唯一批次：
 *  - A 可关闭候选：失败超宽限期 / 无查单能力 / 已超硬上限，独占一个 BATCH；
 *  - B 仅能查单的在途候选（未到硬上限），用 A 剩余名额，不阻塞 A。
 * MySQL DATETIME 为秒级精度，靠 updatedAt 轮转在同一秒内无效，故用能力分组而非时间戳。
 */
async function loadCandidates(tId: number, to: number, cap: number): Promise<ShopOrderPayment[]> {
  const aged = { tenantId: tId, createdAt: { [Op.lt]: new Date(to) } }
  const queryCapable = queryCapableProviders()
  const closeOr: Record<string, unknown>[] = [
    { status: 'failed', createdAt: { [Op.lt]: new Date(cap) } },
  ]
  closeOr.push(
    queryCapable.length === 0
      ? { status: 'initiated' }
      : {
          status: 'initiated',
          [Op.or]: [
            { createdAt: { [Op.lt]: new Date(cap) } },
            { provider: { [Op.notIn]: queryCapable } },
          ],
        },
  )

  const closable = await ShopOrderPayment.findAll({
    where: { ...aged, [Op.or]: closeOr } as never,
    order: [['createdAt', 'ASC'], ['id', 'ASC']] as never,
    limit: BATCH,
  })
  if (queryCapable.length === 0 || closable.length >= BATCH) return closable

  const queryOnly = await ShopOrderPayment.findAll({
    where: {
      ...aged,
      status: 'initiated',
      provider: { [Op.in]: queryCapable },
      createdAt: { [Op.gte]: new Date(cap) },
      id: { [Op.notIn]: closable.map((r) => r.id).concat(0) },
    } as never,
    order: [['createdAt', 'ASC'], ['id', 'ASC']] as never,
    limit: BATCH - closable.length,
  })
  return [...closable, ...queryOnly]
}

export async function reconcilePayments(): Promise<number> {
  const tId = getTenantContext()?.tenantId ?? 1
  const now = Date.now()
  const to = now - timeoutMs()
  const cap = now - HARD_CAP_MS

  const rows = await loadCandidates(tId, to, cap)
  if (rows.length === 0) return 0

  let closed = 0
  for (const row of rows) {
    // failed 单据已过宽限期，不再主动查单，直接进终态
    const gateway = row.status === 'failed' ? undefined : getGateway(row.provider)
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

    if (done) continue

    const created = row.createdAt ? new Date(row.createdAt).getTime() : 0
    const shouldClose = row.status === 'failed' || !gateway?.query || created < cap
    if (shouldClose && (await closePayment(row, tId))) closed++
  }
  return closed
}

/** 枚举当前存在待终态支付单据的租户（不依赖 tenant 表，天然多租户） */
async function pendingPaymentTenantIds(): Promise<number[]> {
  const rows = (await ShopOrderPayment.findAll({
    attributes: [[fn('DISTINCT', col('tenantId')), 'tenantId']],
    where: { status: { [Op.in]: ['initiated', 'failed'] } } as never,
    raw: true,
  })) as unknown as { tenantId: number | string }[]
  return rows.map((r) => Number(r.tenantId)).filter((n) => Number.isInteger(n) && n > 0)
}

/**
 * 注册周期性对账扫描；返回停止函数。intervalMs 默认 5 分钟。
 * 进程全局没有租户上下文，故按待终态单据动态枚举租户（或由调用方显式指定），
 * 每个租户在独立 TenantContext 内扫描，避免只处理 ambient tenant 1。
 */
export function startPaymentReconcileScanner(intervalMs = 5 * 60 * 1000, tenantIds?: number[]): () => void {
  const timer = setInterval(async () => {
    try {
      const tenants = tenantIds?.length ? tenantIds : await pendingPaymentTenantIds()
      for (const tenantId of tenants) {
        const n = await runInTenant({ tenantId }, () => reconcilePayments())
        if (n > 0) logInfo(`[reconcile] tenant=${tenantId} 关单/补单 ${n} 笔`)
      }
    } catch (err) {
      logInfo(`[reconcile] 扫描失败: ${(err as Error).message}`)
    }
  }, Math.max(intervalMs, 10))
  timer.unref?.()
  return () => clearInterval(timer)
}
