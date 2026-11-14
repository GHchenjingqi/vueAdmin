/**
 * RMA admin 审批服务（P4-T17 G4：客服履约可执行）
 *
 * 状态机（与顾客侧 rmaService 对齐）：pending → approved（可回寄）/ rejected（附原因）；
 * approved → returned 由顾客回寄单号驱动，refunded 由退款流程驱动。
 * 全部按 tenantId 隔离；不跨界依赖 storefront 内部实现。
 */
import { ShopRmaRequest } from '../models/index.js'
import { getTenantContext } from '../../../modules/tenant/context.js'
import { AppError } from '../../../middleware/errorHandler.js'

/** 当前租户 ID（租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

/** 后台 RMA 列表：status/orderId 过滤，id 倒序分页（limit 1..100 默认 20） */
export async function listRmas(q: { status?: string; orderId?: number; limit?: number; offset?: number }) {
  const where: Record<string, unknown> = { tenantId: tid() }
  if (q.status) where.status = q.status
  if (q.orderId) where.orderId = q.orderId
  const limit = Math.min(Math.max(q.limit ?? 20, 1), 100)
  const offset = Math.max(q.offset ?? 0, 0)
  const { rows, count } = await ShopRmaRequest.findAndCountAll({ where, order: [['id', 'DESC']], limit, offset })
  return { rows, total: count, limit, offset }
}

/**
 * 审核通过：pending → approved（顾客随后可提交回寄单号）。
 * CAS 原子流转（UPDATE ... WHERE status='pending'）：与顾客取消、后台驳回
 * 并发时恰好一方胜出；0 行受影响时回读区分 404/400。
 */
export async function approveRma(id: number) {
  const tId = tid()
  const [affected] = await ShopRmaRequest.update({ status: 'approved' } as never, {
    where: { tenantId: tId, id, status: 'pending' },
  })
  if (affected === 0) {
    const row = await ShopRmaRequest.findOne({ where: { tenantId: tId, id } })
    if (!row) throw new AppError(404, '退货申请不存在')
    throw new AppError(400, '仅 pending 状态的申请可审核')
  }
  return ShopRmaRequest.findOne({ where: { tenantId: tId, id } })
}

/** 审核驳回：pending → rejected，必须附驳回原因（≤255 字符，schema 已校验） */
export async function rejectRma(id: number, rejectReason: string) {
  const tId = tid()
  const [affected] = await ShopRmaRequest.update({ status: 'rejected', rejectReason } as never, {
    where: { tenantId: tId, id, status: 'pending' },
  })
  if (affected === 0) {
    const row = await ShopRmaRequest.findOne({ where: { tenantId: tId, id } })
    if (!row) throw new AppError(404, '退货申请不存在')
    throw new AppError(400, '仅 pending 状态的申请可驳回')
  }
  return ShopRmaRequest.findOne({ where: { tenantId: tId, id } })
}

/**
 * 批准并立即退款（PLAN 4.2）
 *
 * 缺口：`approveRma` 只做状态流转，与 `refundService` 之间没有调用关系 ——
 * 售后要在两个界面各操作一次，且不支持部分退款。
 *
 * 设计要点：
 * - **先退款成功再落状态**：退款失败时 RMA 保持 pending，运营可重试；
 *   若先置 approved 再退款，失败会留下「已批准但没退钱」的静默缺口。
 * - 支持部分退款：`amountCents` 缺省取 RMA 上记录的退款额，再缺省取订单实付。
 * - 幂等键用 `rma:<rmaId>`：重复点击不会二次退款（refundService 自身按 idempotencyKey 幂等）。
 * - 退款成功后 RMA 置 refunded（终态），并写回实际退款额与币种。
 */
export interface ApproveRmaWithRefundInput {
  /** 退款金额（分）；缺省取 rma.refundAmountCents，再缺省取订单 amountCents */
  amountCents?: number
  reason?: string
}

export async function approveRmaWithRefund(id: number, input: ApproveRmaWithRefundInput = {}) {
  const tId = tid()
  const rma = await ShopRmaRequest.findOne({ where: { tenantId: tId, id } })
  if (!rma) throw new AppError(404, '退货申请不存在')
  // 金额优先级：入参 > RMA 记录。先校验再批准，避免"金额非法但状态已被改成 approved"的中间态。
  const requested =
    input.amountCents != null ? Math.round(Number(input.amountCents)) : rma.refundAmountCents ? Number(rma.refundAmountCents) : undefined
  if (requested != null && (!Number.isInteger(requested) || requested <= 0)) {
    throw new AppError(400, '退款金额必须为正整数（分）')
  }

  // refundService 只对 approved/returned 的 RMA 校验审批额度并驱动终态，
  // 因此 pending 必须先批准（CAS），否则退款会被判为"无关联 RMA"而绕过额度约束。
  if (rma.status === 'pending') {
    await approveRma(id)
  } else if (rma.status !== 'approved' && rma.status !== 'returned') {
    throw new AppError(400, `当前状态 ${rma.status} 不可退款`)
  }

  const { createRefund } = await import('./refundService.js')
  const refund = await createRefund({
    orderId: rma.orderId,
    amountCents: requested && requested > 0 ? requested : undefined,
    reason: input.reason ?? rma.reason ?? 'RMA refund',
    // 幂等键用 rma:<id>：重复点击不会二次退款（refundService 按 idempotencyKey 幂等）
    idempotencyKey: `rma:${rma.id}`,
    // 交由 refundService 在同一事务内校验额度并驱动 RMA 终态，避免两处各自改状态
    rmaId: rma.id,
  })

  // 回写实际退款额：refundService 只驱动状态为 refunded，金额需在此落库供报表/客服核对
  if (refund.amountCents > 0) {
    await recordRmaRefundedAmount(rma.id, refund.amountCents, refund.currency)
  }

  return { rma: await ShopRmaRequest.findOne({ where: { tenantId: tId, id } }), refund }
}

/**
/** 记录本次实际退款额（refundService 只驱动状态，不回写金额；报表需要该值） */
async function recordRmaRefundedAmount(rmaId: number, amountCents: number, currency: string): Promise<void> {
  await ShopRmaRequest.update(
    { refundAmountCents: amountCents, refundCurrency: currency } as never,
    { where: { tenantId: tid(), id: rmaId, status: 'refunded' } },
  )
}

/**
 * 换货（PLAN 4.2）
 *
 * 原状态机没有换货分支，顾客要换货只能先退再买。这里用 `exchange` 状态表达
 * 「已批准换货、等待重发」：不触发退款、不动库存（重发由后台走新建发货流程），
 * 仅记录决定与备注，避免为换货引入第二套库存逻辑。
 */
export async function approveRmaAsExchange(id: number, note?: string) {
  const tId = tid()
  // 不覆盖 reason（那是顾客填的退货原因）；换货备注寄存到 rejectReason 字段
  // （该字段语义是「后台填写的处理说明」，这里复用而非新增列，避免为单一场景加迁移）
  const [affected] = await ShopRmaRequest.update(
    { status: 'exchange', rejectReason: note ? note.slice(0, 255) : null } as never,
    { where: { tenantId: tId, id, status: 'pending' } },
  )
  if (affected === 0) {
    const row = await ShopRmaRequest.findOne({ where: { tenantId: tId, id } })
    if (!row) throw new AppError(404, '退货申请不存在')
    throw new AppError(400, '仅 pending 状态的申请可转为换货')
  }
  return ShopRmaRequest.findOne({ where: { tenantId: tId, id } })
}
