import crypto from 'node:crypto'
import { UniqueConstraintError } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../../modules/tenant/context.js'
import sequelize from '../../../config/database.js'
import { ShopOrderRefund } from '../models/index.js'
import { tryEnqueue } from './orderMailService.js'
import * as auditLogService from './auditLogService.js'
import { withDeadlockRetry } from './deadlockRetry.js'

/**
 * 订单退款（T-09 / P3-T14）
 *
 * - 金额整数「分」，币种**恒取订单快照**，调用方只能请求校验、不能指定；
 * - 仅 captured / refunding 的订单可退；累计（pending+succeeded）不得超过订单实付；
 * - 部分退款 → paymentStatus=refunding，全额 → refunded；
 * - (tenantId, idempotencyKey) 唯一 + 订单行锁，重复请求不二次退款、并发不超退；
 * - 外部支付通道通过可插拔 provider 注入（默认本地记账直成功），异常整笔回滚。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface RefundProviderContext {
  refundNo: string
  orderNo: string
  amountCents: number
  currency: string
}
export type RefundProvider = (ctx: RefundProviderContext) => Promise<{ providerRef?: string } | void> | { providerRef?: string } | void

let refundProvider: RefundProvider | null = null
export function setRefundProvider(fn: RefundProvider | null): void {
  refundProvider = fn
}

export interface CreateRefundParams {
  orderId: number
  /** 省略表示退剩余全部金额；单位：分 */
  amountCents?: number
  reason?: string
  idempotencyKey?: string
  /** 仅用于一致性校验，与订单快照不符直接拒绝；不传则以订单快照为准 */
  currency?: string
}

export interface RefundView {
  id: number
  orderId: number
  orderNo: string
  refundNo: string
  amountCents: number
  currency: string
  reason: string | null
  status: string
  providerRef: string | null
  idempotencyKey: string
  createdAt: Date
}

function genRefundNo(): string {
  return `RF${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}

function toView(row: ShopOrderRefund): RefundView {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNo: row.orderNo,
    refundNo: row.refundNo,
    amountCents: Number(row.amountCents),
    currency: row.currency,
    reason: row.reason,
    status: row.status,
    providerRef: row.providerRef,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
  }
}

/** 死锁重试统一走 deadlockRetry.ts（原生错误码判定 + 指数退避） */

/** P3-T17：退款邮件以退款单号去重；入队失败不影响退款结果 */
async function notifyRefund(view: RefundView): Promise<RefundView> {
  await tryEnqueue({
    orderId: view.orderId,
    type: 'refunded',
    dedupeKey: view.refundNo,
    amountCents: view.amountCents,
  })
  return view
}

/** 列出某订单的退款流水（租户隔离） */
export async function listRefunds(orderId: number): Promise<RefundView[]> {
  const rows = await ShopOrderRefund.findAll({
    where: { orderId, tenantId: tid() },
    order: [['id', 'ASC']],
  })
  return rows.map(toView)
}

/** 创建退款（幂等） */
export async function createRefund(params: CreateRefundParams): Promise<RefundView> {
  const tId = tid()
  const idempotencyKey = (params.idempotencyKey ?? crypto.randomBytes(16).toString('hex')).slice(0, 64)
  // 退款单号在死锁重试之外生成：重试必须复用同一个外部通道幂等键，
  // 否则每轮重试都会换一个 refundNo，provider 侧无法自行去重。
  const refundNo = genRefundNo()

  /**
   * 外部支付通道的副作用在 withDeadlockRetry 重放整个事务时**最多只能发生一次**。
   * 原实现把 provider 调用放在事务内：若 provider 已退款、随后事务因死锁回滚，
   * 重试会再次调用 provider，最终库里只有一条退款流水而外部已退两笔钱。
   * 用跨重试共享的 promise 记住首次调用结果，事务回滚后重试直接复用。
   */
  let providerPromise: Promise<{ providerRef?: string } | void> | null = null
  const invokeProviderOnce = (ctx: RefundProviderContext): Promise<{ providerRef?: string } | void> => {
    const fn = refundProvider
    if (!fn) return Promise.resolve()
    if (!providerPromise) providerPromise = Promise.resolve().then(() => fn(ctx))
    return providerPromise
  }

  const existing = await ShopOrderRefund.findOne({ where: { idempotencyKey, tenantId: tId } })
  if (existing) return notifyRefund(toView(existing))

  try {
    return await notifyRefund(await withDeadlockRetry(() =>
      sequelize.transaction(async (tx) => {
        const [orderRows] = await sequelize.query(
          'SELECT id, orderNo, amountCents, currency, paymentStatus FROM orders WHERE id = ? AND tenantId = ? FOR UPDATE',
          { replacements: [params.orderId, tId], transaction: tx },
        )
        const order = (orderRows as any[])[0]
        if (!order) throw new AppError(404, '订单不存在')

        if (!['captured', 'refunding'].includes(order.paymentStatus)) {
          throw new AppError(400, `ORDER_NOT_REFUNDABLE: 当前支付状态 ${order.paymentStatus} 不可退款`)
        }
        if (params.currency && params.currency.toUpperCase() !== order.currency.toUpperCase()) {
          throw new AppError(400, `REFUND_CURRENCY_MISMATCH: 退款币种须与订单快照 ${order.currency} 一致`)
        }

        const paidCents = Number(order.amountCents)
        const [sumRows] = await sequelize.query(
          "SELECT COALESCE(SUM(amountCents), 0) AS total FROM shop_order_refunds WHERE tenantId = ? AND orderId = ? AND status IN ('pending', 'succeeded')",
          { replacements: [tId, params.orderId], transaction: tx },
        )
        const alreadyRefunded = Number((sumRows as any[])[0]?.total ?? 0)
        const remaining = paidCents - alreadyRefunded
        if (remaining <= 0) throw new AppError(400, 'REFUND_EXCEEDS_PAID: 订单已全额退款')

        const amountCents = params.amountCents ?? remaining
        if (!Number.isInteger(amountCents) || amountCents <= 0) {
          throw new AppError(400, 'REFUND_INVALID_AMOUNT: 退款金额须为正整数分')
        }
        if (amountCents > remaining) {
          throw new AppError(400, `REFUND_EXCEEDS_PAID: 最多可退 ${remaining} 分`)
        }

        let providerRef: string | null = null
        if (refundProvider) {
          try {
            const result = await invokeProviderOnce({ refundNo, orderNo: order.orderNo, amountCents, currency: order.currency })
            providerRef = (result as { providerRef?: string } | undefined)?.providerRef ?? null
          } catch (err) {
            throw new AppError(502, `REFUND_PROVIDER_FAILED: ${err instanceof Error ? err.message : String(err)}`)
          }
        }

        const row = await ShopOrderRefund.create(
          {
            tenantId: tId,
            orderId: params.orderId,
            orderNo: order.orderNo,
            refundNo,
            amountCents,
            currency: order.currency,
            reason: params.reason ?? null,
            status: 'succeeded',
            providerRef,
            idempotencyKey,
          } as never,
          { transaction: tx },
        )

        // X-T03：审计退款创建（system 事件，写入同事务；失败被服务吞掉，不阻断主流程）
        await auditLogService.record(
          {
            actorType: 'system',
            action: 'refund.created',
            entityType: 'refund',
            entityId: row.id,
            afterState: { orderId: params.orderId, refundNo, amountCents, currency: order.currency },
          },
          tx,
        )

        const total = alreadyRefunded + amountCents
        // 部分退款 → refunding；全额 → refunded（订单状态保持 paid，历史履约事实不改写）
        await sequelize.query('UPDATE orders SET paymentStatus = ?, updatedAt = NOW() WHERE id = ? AND tenantId = ?', {
          replacements: [total >= paidCents ? 'refunded' : 'refunding', params.orderId, tId],
          transaction: tx,
        })

        return toView(row)
      }),
    ))
  } catch (err) {
    // 并发下同一幂等键已被处理：返回首笔结果，不二次退款
    if (err instanceof UniqueConstraintError) {
      const dup = await ShopOrderRefund.findOne({ where: { idempotencyKey, tenantId: tId } })
      if (dup) return notifyRefund(toView(dup))
    }
    throw err
  }
}
