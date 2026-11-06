import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopTaxRate } from '../../shop/models/index.js'

/**
 * P3-T06 税费计算（可插拔 Provider）
 *
 * 设计要点：
 * - 币种一致性：税费以「分」计，与 subtotalCents 同为订单币种单位，
 *   因此 taxCents 自然与报价币种一致（provider 返回的 currency 必须等于入参 currency）。
 * - fail-closed（阻断）：当目的国无具体税率、且无租户默认税率时，**抛 TAX_UNAVAILABLE 阻断报价**，
 *   绝不静默按 0 处理（防止漏税）。缺失配置属运维事故，需显式修复而非悄悄免税。
 * - 可插拔：默认实现为「规则表 Provider」，可经 setTaxProvider 替换为第三方税务 API。
 * - 反向征收（reverse charge）：企业买家提供有效税号时税率为 0 并标注原因。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface TaxLine {
  /** 实际适用税率（0..1） */
  rate: number
  /** 税费（分），与入参 currency 同币种 */
  taxCents: number
  /** 币种（应与入参一致） */
  currency: string
  /** 适用原因/策略，如 reverse_charge / rule_table / default */
  reason?: string
}

export interface TaxContext {
  /** 目的国 ISO-3166-1 alpha-2 */
  country: string
  /** 税前金额（分） */
  subtotalCents: number
  /** 币种代码（3 位） */
  currency: string
  /** 买家类型，企业买家可提供税号走反向征收 */
  customerType?: 'individual' | 'business'
  /** 企业买家税号（VAT/GST 等） */
  taxId?: string
}

export interface TaxProvider {
  name: string
  calculate(ctx: TaxContext): Promise<TaxLine>
}

/** 解析适用税率与来源：目的国具体税率 > 租户默认税率 > null（交由调用方阻断） */
async function lookupRate(country: string): Promise<{ rate: number; source: 'rule_table' | 'default' } | null> {
  const tId = tid()
  const specific = await ShopTaxRate.findOne({
    where: { tenantId: tId, country: country.toUpperCase(), active: true } as never,
    order: [['priority', 'DESC']],
  })
  if (specific) return { rate: Number(specific.rate), source: 'rule_table' }
  const def = await ShopTaxRate.findOne({
    where: { tenantId: tId, isDefault: true, active: true } as never,
    order: [['priority', 'DESC']],
  })
  if (def) return { rate: Number(def.rate), source: 'default' }
  return null
}

/** 默认规则表 Provider */
function createDefaultTaxProvider(): TaxProvider {
  return {
    name: 'rule-table',
    async calculate(ctx: TaxContext): Promise<TaxLine> {
      // 企业买家 + 有效税号 → 反向征收，税率 0
      if (ctx.customerType === 'business' && ctx.taxId && ctx.taxId.trim().length >= 4) {
        return { rate: 0, taxCents: 0, currency: ctx.currency, reason: 'reverse_charge' }
      }
      const found = await lookupRate(ctx.country)
      if (found == null) {
        // fail-closed：未配置税率时阻断报价，不静默免税
        throw new AppError(422, `TAX_UNAVAILABLE: 未配置目的国 ${ctx.country} 的税率，已阻断报价以防漏税`)
      }
      // fail-closed：rate 契约是 0..1 的小数。DECIMAL(5,4) 允许 9.9999，
      // 运维把 19% 误填成 19 会被存成 9.9999 并算出约 10 倍税费；
      // 配置异常必须阻断报价，不能把误收税转嫁给买家。
      if (!Number.isFinite(found.rate) || found.rate < 0 || found.rate > 1) {
        throw new AppError(
          422,
          `TAX_RATE_INVALID: 目的国 ${ctx.country} 的税率 ${found.rate} 超出 0..1 范围，已阻断报价以防误收税`,
        )
      }
      const taxCents = Math.round(ctx.subtotalCents * found.rate)
      return { rate: found.rate, taxCents, currency: ctx.currency, reason: found.source }
    },
  }
}

let provider: TaxProvider = createDefaultTaxProvider()

/** 替换税费 Provider（如接入第三方税务 API） */
export function setTaxProvider(p: TaxProvider): void {
  provider = p
}

/** 读取当前 Provider（测试/调试用） */
export function getTaxProvider(): TaxProvider {
  return provider
}

/** 计算税费（统一入口） */
export async function resolveTax(ctx: TaxContext): Promise<TaxLine> {
  return provider.calculate(ctx)
}
