import { AppError } from '../../../middleware/errorHandler.js'
import { Op } from 'sequelize'
import type { Attributes, WhereOptions } from 'sequelize'
import { ShopSku, ShopSpu } from '../models/index.js'
import type { CreateSkuInput, SpuStatus, UpdateSkuInput } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

export async function listSkusBySpu(spuId: number) {
  return ShopSku.findAll({ where: { spuId, tenantId: tid() }, order: [['id', 'ASC']] })
}

/**
 * 全局 SKU 列表（跨 SPU），供库存中心选择 SKU 使用。
 * keyword 同时匹配 SKU 编码与条码。
 */
export async function listSkus(params: { keyword?: string; page?: number; pageSize?: number } = {}) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where: WhereOptions<Attributes<ShopSku>> = { tenantId: tid() }
  if (params.keyword) {
    where[Op.or] = [{ code: { [Op.like]: `%${params.keyword}%` } }, { barcode: { [Op.like]: `%${params.keyword}%` } }]
  }
  const { rows, count } = await ShopSku.findAndCountAll({
    where,
    order: [['id', 'ASC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

export async function getSkuById(id: number): Promise<ShopSku> {
  const row = await ShopSku.findOne({ where: { id, tenantId: tid() } })
  if (!row) throw new AppError(404, 'SKU 不存在')
  return row
}

export async function createSku(input: CreateSkuInput): Promise<ShopSku> {
  // SPU 必须存在且未归档
  const spu = await ShopSpu.findOne({ where: { id: input.spuId, tenantId: tid() } })
  if (!spu) throw new AppError(404, '所属商品不存在')
  if (spu.status === 'archived') throw new AppError(400, '商品已归档，不能再新增 SKU')
  const exists = await ShopSku.count({ where: { code: input.code, tenantId: tid() } })
  if (exists > 0) throw new AppError(400, `SKU 编码 ${input.code} 已存在`)
  return ShopSku.create({ ...input, tenantId: getTenantContext()?.tenantId ?? 1 } as never)
}

export async function updateSku(id: number, input: UpdateSkuInput): Promise<ShopSku> {
  const row = await getSkuById(id)
  if (input.code && input.code !== row.code) {
    const exists = await ShopSku.count({ where: { code: input.code, tenantId: tid() } })
    if (exists > 0) throw new AppError(400, `SKU 编码 ${input.code} 已存在`)
  }
  await row.update(input as never)
  return row
}

export async function deleteSku(id: number): Promise<void> {
  const row = await getSkuById(id)
  if (!['draft', 'rejected', 'archived'].includes(row.status)) {
    throw new AppError(400, `当前状态 ${row.status} 不允许删除，请先下架或归档`)
  }
  await row.destroy()
}

/** SPU 状态变更时，SKU 一并跟随流转 */
export async function followSpuStatus(spuId: number, spuStatus: SpuStatus): Promise<void> {
  await ShopSku.update({ status: spuStatus }, { where: { spuId, tenantId: tid() } })
}
