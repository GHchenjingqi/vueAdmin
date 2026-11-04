import { AppError } from '../../../middleware/errorHandler.js'
import { ShopSku, ShopSpu } from '../models/index.js'
import type { CreateSkuInput, SpuStatus, UpdateSkuInput } from '../../../shared/schemas/shop.js'

export async function listSkusBySpu(spuId: number) {
  return ShopSku.findAll({ where: { spuId }, order: [['id', 'ASC']] })
}

export async function getSkuById(id: number): Promise<ShopSku> {
  const row = await ShopSku.findByPk(id)
  if (!row) throw new AppError(404, 'SKU 不存在')
  return row
}

export async function createSku(input: CreateSkuInput): Promise<ShopSku> {
  // SPU 必须存在且未归档
  const spu = await ShopSpu.findByPk(input.spuId)
  if (!spu) throw new AppError(404, '所属商品不存在')
  if (spu.status === 'archived') throw new AppError(400, '商品已归档，不能再新增 SKU')
  const exists = await ShopSku.count({ where: { code: input.code } })
  if (exists > 0) throw new AppError(400, `SKU 编码 ${input.code} 已存在`)
  return ShopSku.create(input as never)
}

export async function updateSku(id: number, input: UpdateSkuInput): Promise<ShopSku> {
  const row = await getSkuById(id)
  if (input.code && input.code !== row.code) {
    const exists = await ShopSku.count({ where: { code: input.code } })
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
  await ShopSku.update({ status: spuStatus }, { where: { spuId } })
}
