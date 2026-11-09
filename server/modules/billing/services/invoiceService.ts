import Invoice from '../models/Invoice.js'
import type Plan from '../models/Plan.js'
import type { Transaction } from 'sequelize'

/**
 * 出账：套餐变更/开通时生成当期账单（status=pending）。
 *
 * 金额口径取月费——真实支付网关未接入前不猜年付折算规则；
 * Payment 表因此暂无写入方，等接入网关时再随回调一起设计。
 */
export async function issueInvoice(input: { tenantId: number; plan: Plan; periodStart: Date; periodEnd: Date; transaction?: Transaction }) {
  return Invoice.create(
    {
      tenantId: input.tenantId,
      planId: input.plan.id,
      amount: Number(input.plan.priceMonthly),
      currency: 'CNY',
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: 'pending',
    },
    { transaction: input.transaction },
  )
}
