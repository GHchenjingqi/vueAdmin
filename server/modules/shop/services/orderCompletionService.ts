import { Op, fn, col } from 'sequelize'
import { ShopOrder, ShopOrderShipment, ShopRmaRequest } from '../models/index.js'
import { getTenantContext, runInTenant } from '../../tenant/context.js'
import { logInfo } from '../../../utils/fileLogger.js'
import { notifyAsync } from '../../../services/notificationDispatcher.js'

/**
 * 订单自动完结（降本 P0-2）
 *
 * 背景：ShopOrder 状态枚举定义了 done，但全仓只有读取、没有任何写入路径，
 * 导致已发货订单永远停在 shipped，售后时效、复购判定、佣金可结算时点都要人工兜底。
 *
 * 规则（保守优先，不做资金动作）：
 * - 仅 shipped → done；以「最近一次物流单创建时间」为起算点，满 N 天（默认 14，可用
 *   ORDER_AUTO_COMPLETE_DAYS 覆盖，1..365）才完结；orders.updatedAt 只用于粗筛，
 *   真正的到期判定用 order_shipments.createdAt，避免其它字段更新误提前完结。
 * - 存在进行中售后（pending / approved / returned）的订单跳过，留给人工处理，
 *   避免售后未闭环就被标记完成。
 * - 无物流单的订单跳过并计数（不猜测发货时间），由后台补录运单后再纳入。
 * - CAS 更新（WHERE status='shipped'）保证多副本重复调度时幂等、不覆盖并发取消。
 * - 只改订单状态：不自动结算佣金、不自动退款、不自动发确认收货邮件，
 *   资金与触达动作仍由人工/既有流程控制。
 */

const DEFAULT_DAYS = 14
const BATCH = 100
/** 进行中售后：这些状态下不允许自动完结 */
const ACTIVE_RMA_STATUSES = ['pending', 'approved', 'returned']

export interface AutoCompleteResult {
  days: number
  tenants: number
  scanned: number
  completed: number
  skippedRma: number
  skippedNoShipment: number
  skippedNotDue: number
}

function configuredDays(): number {
  const raw = Number(process.env.ORDER_AUTO_COMPLETE_DAYS)
  return Number.isFinite(raw) && raw >= 1 && raw <= 365 ? Math.floor(raw) : DEFAULT_DAYS
}

/** 枚举存在已发货订单的租户（不依赖 tenant 表，天然多租户；仿对账扫描器） */
async function shippedOrderTenantIds(): Promise<number[]> {
  const rows = (await ShopOrder.findAll({
    attributes: [[fn('DISTINCT', col('tenantId')), 'tenantId']],
    where: { status: 'shipped' },
    raw: true,
  })) as unknown as { tenantId: number | string }[]
  const ids = new Set<number>()
  for (const row of rows) {
    const n = Number(row.tenantId)
    if (Number.isInteger(n) && n > 0) ids.add(n)
  }
  return [...ids]
}

async function completeForTenant(cutoff: Date): Promise<Omit<AutoCompleteResult, 'days' | 'tenants'>> {
  const tId = getTenantContext()?.tenantId ?? 1
  // 粗筛：updatedAt 早于截止时间的已发货订单。状态变更为 shipped 时 updatedAt 会刷新，
  // 因此这是保守下界；真正判定仍以物流单创建时间为准。
  const candidates = await ShopOrder.findAll({
    where: { tenantId: tId, status: 'shipped', updatedAt: { [Op.lt]: cutoff } },
    attributes: ['id', 'orderNo'],
    order: [['id', 'ASC']],
    limit: BATCH,
  })
  const result = { scanned: candidates.length, completed: 0, skippedRma: 0, skippedNoShipment: 0, skippedNotDue: 0 }
  if (candidates.length === 0) return result

  const ids = candidates.map((o) => o.id)

  // 最近一次发货时间（同一订单可能有多条运单，取最新一条，最保守）
  const shipments = await ShopOrderShipment.findAll({
    where: { tenantId: tId, orderId: { [Op.in]: ids } },
    attributes: ['orderId', 'createdAt'],
    order: [['createdAt', 'DESC']],
  })
  const shippedAt = new Map<number, Date>()
  for (const s of shipments) {
    if (!shippedAt.has(s.orderId)) shippedAt.set(s.orderId, new Date(s.createdAt))
  }

  // 进行中售后：整批一次查询，避免 N+1
  const activeRmas = await ShopRmaRequest.findAll({
    where: { tenantId: tId, orderId: { [Op.in]: ids }, status: { [Op.in]: ACTIVE_RMA_STATUSES } },
    attributes: ['orderId'],
  })
  const blocked = new Set(activeRmas.map((r) => r.orderId))

  for (const order of candidates) {
    if (blocked.has(order.id)) {
      result.skippedRma++
      continue
    }
    const at = shippedAt.get(order.id)
    if (!at) {
      result.skippedNoShipment++
      continue
    }
    if (at.getTime() > cutoff.getTime()) {
      result.skippedNotDue++
      continue
    }
    const [affected] = await ShopOrder.update(
      { status: 'done' },
      { where: { id: order.id, tenantId: tId, status: 'shipped' } },
    )
    if (affected > 0) {
      result.completed++
      logInfo(`[auto-complete] 订单 ${order.orderNo} 已自动完结（发货于 ${at.toISOString()}）`)
    }
  }
  return result
}

/**
 * 扫描并自动完结到期订单。供定时任务 handler 调用，返回可写回 tasks.lastResult 的汇总。
 * 不传 tenantIds 时枚举全部租户；传入时只处理指定租户（定向补跑 / 隔离验证用，
 * 与 startPaymentReconcileScanner 的 tenantIds 参数保持同一范式）。
 */
export async function autoCompleteShippedOrders(tenantIds?: number[]): Promise<AutoCompleteResult> {
  const days = configuredDays()
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const tenants = tenantIds?.length ? [...new Set(tenantIds)] : await shippedOrderTenantIds()
  const totals: AutoCompleteResult = {
    days,
    tenants: tenants.length,
    scanned: 0,
    completed: 0,
    skippedRma: 0,
    skippedNoShipment: 0,
    skippedNotDue: 0,
  }

  for (const tenantId of tenants) {
    await runInTenant({ tenantId }, async () => {
      try {
        const part = await completeForTenant(cutoff)
        totals.scanned += part.scanned
        totals.completed += part.completed
        totals.skippedRma += part.skippedRma
        totals.skippedNoShipment += part.skippedNoShipment
        totals.skippedNotDue += part.skippedNotDue
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logInfo(`[auto-complete] tenant=${tenantId} 扫描失败: ${message}`)
        notifyAsync({
          event: 'order.auto_complete_failed',
          subject: `[订单自动完结] 租户 ${tenantId} 扫描失败`,
          text: `本轮该租户的已发货订单未完结，可能滞留 shipped 状态。\n错误: ${message}\n下一轮定时任务会自动重试。`,
        })
      }
    })
  }

  // 固定 subject + 默认冷却：多副本同分钟重复调度时不会重复推送同一份日报
  if (totals.completed > 0 || totals.skippedRma > 0 || totals.skippedNoShipment > 0) {
    notifyAsync({
      event: 'order.auto_complete',
      subject: '[订单自动完结] 批处理结果',
      text: [
        `规则：发货满 ${days} 天自动完结（仅 shipped → done）。`,
        `扫描 ${totals.scanned} 单 / ${totals.tenants} 个租户，完结 ${totals.completed} 单。`,
        `跳过：售后进行中 ${totals.skippedRma} 单、无物流单 ${totals.skippedNoShipment} 单、未到期 ${totals.skippedNotDue} 单。`,
        '说明：不自动结算佣金与退款，资金动作仍需人工确认。',
      ].join('\n'),
    })
  }

  return totals
}
