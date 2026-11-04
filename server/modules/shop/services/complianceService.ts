import { AppError } from '../../../middleware/errorHandler.js'
import { ShopSpu, ShopSku } from '../models/index.js'
import { getTenantContext } from '../../../modules/tenant/context.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface ComplianceMissing {
  skuId: number
  skuCode: string
  /** 缺失项中文说明 */
  fields: string[]
}

export interface ComplianceResult {
  ok: boolean
  missing: ComplianceMissing[]
}

/**
 * 合规校验卡点（跨境红线：清关第一风险）。
 * 发布/审批前校验每个 SKU 是否齐备：原产国、HS 编码、申报价值，以及合规资质（compliance 非空）。
 *
 * @param spuId SPU ID
 * @param requiredQualifications 渠道要求的合规资质 key 列表（如 ['ce', 'fcc']），缺省只校验基础三项
 */
export async function checkSpuCompliance(spuId: number, requiredQualifications: string[] = []): Promise<ComplianceResult> {
  const spu = await ShopSpu.findOne({ where: { id: spuId, tenantId: tid() } })
  if (!spu) throw new AppError(404, '商品不存在')

  const skus = await ShopSku.findAll({ where: { spuId, tenantId: tid() } })
  if (skus.length === 0) {
    return { ok: false, missing: [] }
  }

  const missing: ComplianceMissing[] = []
  for (const sku of skus) {
    const fields: string[] = []
    if (!sku.originCountry) fields.push('原产国(originCountry)')
    if (!sku.hsCode) fields.push('HS 编码(hsCode)')
    if (sku.declaredValue == null) fields.push('申报价值(declaredValue)')

    if (requiredQualifications.length > 0) {
      const compliance = (sku.compliance as Record<string, string> | null) || {}
      for (const q of requiredQualifications) {
        if (!compliance[q]) fields.push(`合规资质(${q})`)
      }
    }

    if (fields.length > 0) {
      missing.push({ skuId: sku.id, skuCode: sku.code, fields })
    }
  }

  return { ok: missing.length === 0, missing }
}
