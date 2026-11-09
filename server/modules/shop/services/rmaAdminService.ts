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
