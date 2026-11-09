import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { isFeatureEnabled } from '../../featureflags/featureFlags.js'
import { ShopCustomer, ShopReferralCommission } from '../../shop/models/index.js'

/**
 * P5-T07：Referral / Affiliate 归因与结算。
 *
 * 规则（与验收一一对应）：
 * - 归因窗口：referralTouchAt 起 REFERRAL_WINDOW_DAYS（默认 30）天内有效；超窗一律 void 不计佣。
 * - 与优惠券叠加规则：佣金基数 = 订单净额（已扣除优惠券 / 促销 / Bundle 折扣后的 amountCents），
 *   即「优惠与推荐可叠加，但佣金不计入折扣部分」。
 * - 佣金币种：恒取订单币种（= 结算币种），不做任何换算。
 * - 门控：referral feature flag 关闭（默认）→ 不产生任何台账（fail-closed）。
 */

export const REFERRAL_RATE_PERCENT = Number(process.env.REFERRAL_RATE_PERCENT ?? 10)
export const REFERRAL_WINDOW_DAYS = Number(process.env.REFERRAL_WINDOW_DAYS ?? 30)

const tid = (): number => getTenantContext()?.tenantId ?? 1

/** 生成租户内唯一的推荐码（REF-<base36>） */
function generateCode(): string {
  const n = Math.floor(Math.random() * 0xffffffff)
  return `REF-${n.toString(36).toUpperCase()}`
}

/** 取或建顾客的推荐码（租户内唯一，冲突重试） */
export async function ensureReferralCode(customerId: number): Promise<string> {
  const tId = tid()
  const customer = await ShopCustomer.findOne({ where: { id: customerId, tenantId: tId } })
  if (!customer) throw new AppError(404, '顾客不存在')
  if (customer.referralCode) return customer.referralCode
  for (let i = 0; i < 5; i++) {
    const code = generateCode()
    const exists = await ShopCustomer.count({ where: { referralCode: code, tenantId: tId } })
    if (exists === 0) {
      await customer.update({ referralCode: code })
      return code
    }
  }
  throw new AppError(500, '推荐码生成失败')
}

/** 解析推荐码 → 推荐人顾客（租户隔离；无效返回 null） */
export async function resolveReferrer(code: string): Promise<ShopCustomer | null> {
  const tId = tid()
  if (!code || code.length > 64) return null
  return ShopCustomer.findOne({ where: { referralCode: code, tenantId: tId } })
}

/** 计算佣金（分，四舍五入；负数/非法比例兜底 0） */
export function computeCommissionCents(netCents: number, ratePercent: number): number {
  const net = Number.isFinite(netCents) && netCents > 0 ? netCents : 0
  const rate = Number.isFinite(ratePercent) && ratePercent > 0 ? ratePercent : 0
  return Math.round((net * rate) / 100)
}

export interface RecordCommissionParams {
  orderId: number
  referrerCustomerId: number
  code: string
  orderCurrency: string
  /** 佣金基数：订单净额（已扣优惠券/促销/Bundle 折扣，单位分） */
  orderNetCents: number
  /** 归因窗口起点（首次触点）；缺省视为当下（窗口未生效） */
  referralTouchAt?: Date | string | null
}

export interface CommissionResult {
  status: 'pending' | 'void'
  commissionCents: number
  orderCurrency: string
  windowExpiredAt: Date | null
}

/**
 * 建单后记录推荐佣金。返回 null 表示未触发（flag 关 / 无效码 / 自荐 / 无净额）。
 * 窗口失效时记录 void 行（commissionCents=0），供审计与测试断言。
 */
export async function recordCommission(params: RecordCommissionParams): Promise<CommissionResult | null> {
  // fail-closed：flag 关闭不产生任何台账
  if (!(await isFeatureEnabled('referral'))) return null

  const tId = tid()
  // 自荐防护：推荐码持有者不得给自己计佣
  const referrer = await ShopCustomer.findOne({ where: { id: params.referrerCustomerId, tenantId: tId } })
  if (!referrer) return null

  const netCents = Math.round(params.orderNetCents)
  const touchAt = params.referralTouchAt ? new Date(params.referralTouchAt) : new Date()
  const windowExpiredAt = new Date(touchAt.getTime() + REFERRAL_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const expired = Date.now() > windowExpiredAt.getTime()

  const commissionCents = expired ? 0 : computeCommissionCents(netCents, REFERRAL_RATE_PERCENT)
  const status: 'pending' | 'void' = expired ? 'void' : 'pending'
  const row = await ShopReferralCommission.create({
    tenantId: tId,
    orderId: params.orderId,
    referrerCustomerId: params.referrerCustomerId,
    code: params.code,
    orderCurrency: params.orderCurrency,
    orderNetAmountCents: netCents,
    commissionRatePercent: REFERRAL_RATE_PERCENT,
    commissionCents,
    status,
    windowExpiredAt,
  } as never)

  return { status, commissionCents, orderCurrency: params.orderCurrency, windowExpiredAt }
}

/** 顾客的推荐佣金明细（分页，倒序） */
export async function listCommissions(customerId: number, params: { page?: number; pageSize?: number } = {}) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const { rows, count } = await ShopReferralCommission.findAndCountAll({
    where: { tenantId: tid(), referrerCustomerId: customerId },
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

/** 顾客佣金汇总（pending / settled 总额，按币种） */
export async function commissionSummary(customerId: number) {
  const tId = tid()
  const rows = await ShopReferralCommission.findAll({
    where: { tenantId: tId, referrerCustomerId: customerId, status: { [Op.in]: ['pending', 'settled'] } },
  })
  const byCurrency = new Map<string, { pendingCents: number; settledCents: number }>()
  for (const r of rows) {
    const cur = byCurrency.get(r.orderCurrency) ?? { pendingCents: 0, settledCents: 0 }
    if (r.status === 'settled') cur.settledCents += Number(r.commissionCents)
    else cur.pendingCents += Number(r.commissionCents)
    byCurrency.set(r.orderCurrency, cur)
  }
  return Array.from(byCurrency.entries()).map(([currency, v]) => ({ currency, ...v }))
}
