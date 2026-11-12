import { Op, fn, col } from 'sequelize'
import sequelize from '../../../config/database.js'
import { getTenantContext, runInTenant } from '../../tenant/context.js'
import { ShopOrder, ShopOrderPayment, ShopInventoryReservation } from '../../shop/models/index.js'
import * as reservationService from '../../shop/services/reservationService.js'
import * as auditLogService from '../../shop/services/auditLogService.js'
import { releaseCoupon } from './couponService.js'
import { getGateway } from '../payments/gatewayRegistry.js'
import { PROVIDERS } from '../payments/providerRegistry.js'
import { applyGatewayEvent } from './paymentService.js'
import { logInfo } from '../../../utils/fileLogger.js'
import { notifyAsync } from '../../../services/notificationDispatcher.js'

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
 * 关单：在订单行锁事务内串行完成「CAS 认领单据终态 → 判断能否释放订单级资源 →
 * 落订单终态」，事务提交后再释放库存/券（二者各自开事务，不能嵌套）。
 *
 * 行锁的目的：同一订单可以有多张支付单据（换通道重试 / 前端重复建会话），
 * 两个扫描器实例并发关单时若无互斥，会互相看到对方仍为 initiated 而都跳过释放，
 * 券占用与库存锁将永久悬挂。
 */
async function closePayment(row: ShopOrderPayment, tId: number): Promise<boolean> {
  const original = row.status
  let claimed = false
  let shouldRelease = false
  let orderId: number | null = null

  await sequelize.transaction(async (tx) => {
    const order = await ShopOrder.findOne({
      where: { tenantId: tId, orderNo: row.orderNo } as never,
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    } as never)

    const [n] = await ShopOrderPayment.update(
      { status: 'expired' } as never,
      { where: { id: row.id, tenantId: tId, status: original } as never, transaction: tx },
    )
    if (n !== 1) return
    claimed = true

    // 已成交订单：只关这张单据，绝不回退券流水，也绝不把订单置为终态
    if (order && (SETTLED_ORDER_STATUSES.has(order.paymentStatus ?? '') || order.status === 'paid')) return

    // 同单仍有在途支付单据（用户正在重试）：同样不动订单级资源
    const live = await ShopOrderPayment.count({
      where: {
        tenantId: tId,
        orderNo: row.orderNo,
        id: { [Op.ne]: row.id },
        status: { [Op.in]: LIVE_PAYMENT_STATUSES },
      } as never,
      transaction: tx,
    })
    if (live > 0) return

    shouldRelease = true
    // 释放订单级资源 == 订单确实未支付被放弃。同步落终态，堵住
    // 「券已退但订单仍可支付 → 限量券无限复用」的绕过链。
    if (order) {
      orderId = order.id
      await order.update({ status: 'cancelled', paymentStatus: 'failed' } as never, { transaction: tx })
    }
  })

  if (!claimed) return false
  if (!shouldRelease) return true

  try {
    await reservationService.releaseReservation(row.orderNo)
    await releaseCoupon(row.orderNo)
    // 扫描器无 req，按 system 事件留痕；只记状态字面量与单号，不记任何金额/凭据
    await auditLogService.record({
      actorType: 'system',
      action: 'order.reconcile_closed',
      entityType: 'order',
      entityId: orderId,
      afterState: { orderNo: row.orderNo, status: 'cancelled' },
    })
  } catch (err) {
    // 资源没释放成功就不能让单据停在终态，否则下轮不再扫描，占用永久悬挂
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

/**
 * 枚举需要跑「未支付订单资源回收」的租户：支付单据与库存预占两张表取并集。
 * 只从 order_payments 枚举会漏掉「建了单但从未创建支付会话」的订单，其预占
 * 到期后没有任何扫描器会释放。不依赖 tenant 表，天然多租户。
 */
export async function pendingResourceTenantIds(): Promise<number[]> {
  const [payments, reservations] = await Promise.all([
    ShopOrderPayment.findAll({
      attributes: [[fn('DISTINCT', col('tenantId')), 'tenantId']],
      where: { status: { [Op.in]: ['initiated', 'failed'] } } as never,
      raw: true,
    }) as unknown as Promise<{ tenantId: number | string }[]>,
    ShopInventoryReservation.findAll({
      attributes: [[fn('DISTINCT', col('tenantId')), 'tenantId']],
      where: { status: 'active' } as never,
      raw: true,
    }) as unknown as Promise<{ tenantId: number | string }[]>,
  ])
  const ids = new Set<number>()
  for (const r of [...payments, ...reservations]) {
    const n = Number(r.tenantId)
    if (Number.isInteger(n) && n > 0) ids.add(n)
  }
  return [...ids]
}

/**
 * 「未支付订单资源回收」统一扫描器：同一 tick 内按租户驱动
 * ①支付单据对账/关单 ②过期库存预占回收，二者失败互相隔离。
 *
 * 历史上 releaseExpiredReservations() 只有测试调用、生产从未注册定时器，
 * 导致 TTL 到期的预占与券占用永久悬挂；此处与对账共用同一个已注册的
 * 进程级定时器与租户枚举，避免再出现「有实现、无调度」的治理盲区。
 * 返回停止函数；timer.unref() 避免挂住优雅关闭/测试进程退出。
 */
export function startPaymentReconcileScanner(intervalMs = 5 * 60 * 1000, tenantIds?: number[]): () => Promise<void> {
  let inFlight: Promise<void> | null = null

  const tick = async (): Promise<void> => {
    try {
      const tenants = tenantIds?.length ? tenantIds : await pendingResourceTenantIds()
      for (const tenantId of tenants) {
        await runInTenant({ tenantId }, async () => {
          try {
            const n = await reconcilePayments()
            if (n > 0) logInfo(`[reconcile] tenant=${tenantId} 关单/补单 ${n} 笔`)
          } catch (err) {
            const message = (err as Error).message
            logInfo(`[reconcile] tenant=${tenantId} 对账失败: ${message}`)
            notifyAsync({
              event: 'payment.reconcile_failed',
              subject: `[对账异常] 租户 ${tenantId}`,
              text: `支付单据对账/补单扫描失败，本轮该租户未处理。\n错误: ${message}\n请检查网关连通性与数据库连接。`,
            })
          }
          try {
            const released = await reservationService.releaseExpiredReservations()
            if (released > 0) logInfo(`[reconcile] tenant=${tenantId} 释放过期预占 ${released} 笔`)
          } catch (err) {
            const message = (err as Error).message
            logInfo(`[reconcile] tenant=${tenantId} 预占回收失败: ${message}`)
            notifyAsync({
              event: 'inventory.reservation_release_failed',
              subject: `[库存预占] 租户 ${tenantId} 回收失败`,
              text: `过期库存预占与券占用本轮未释放，可能存在悬挂占用。\n错误: ${message}\n扫描器将在下一轮自动重试。`,
            })
          }
        })
      }
    } catch (err) {
      const message = (err as Error).message
      logInfo(`[reconcile] 扫描失败: ${message}`)
      notifyAsync({
        event: 'payment.reconcile_scan_failed',
        subject: '[对账异常] 全局扫描失败',
        text: `未支付订单资源回收扫描器本轮整体失败（租户枚举阶段）。\n错误: ${message}\n请检查数据库连接与 orders / order_payments 表状态。`,
      })
    }
  }

  const timer = setInterval(() => {
    if (inFlight) return // 上一轮未完成则跳过，避免同进程内重入
    inFlight = tick().catch(() => undefined).finally(() => { inFlight = null })
  }, Math.max(intervalMs, 10))
  timer.unref?.()

  /** 停止并等待在途 tick 结束：优雅关闭时不会有半截事务与后续清理抢锁 */
  return async () => {
    clearInterval(timer)
    if (inFlight) await inFlight
  }
}
