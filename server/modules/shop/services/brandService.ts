import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { ShopBrand, ShopSpu } from '../models/index.js'
import type { CreateBrandInput, UpdateBrandInput } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

export async function listBrands(params: { page?: number; pageSize?: number; keyword?: string }) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where = params.keyword ? { name: { [Op.like]: `%${params.keyword}%` }, tenantId: tid() } : { tenantId: tid() }
  const { rows, count } = await ShopBrand.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

export async function getBrandById(id: number): Promise<ShopBrand> {
  const row = await ShopBrand.findOne({ where: { id, tenantId: tid() } })
  if (!row) throw new AppError(404, '品牌不存在')
  return row
}

export async function createBrand(input: CreateBrandInput): Promise<ShopBrand> {
  return ShopBrand.create({ ...input, tenantId: getTenantContext()?.tenantId ?? 1 } as never)
}

export async function updateBrand(id: number, input: UpdateBrandInput): Promise<ShopBrand> {
  const row = await getBrandById(id)
  await row.update(input as never)
  return row
}

export async function deleteBrand(id: number): Promise<void> {
  const row = await getBrandById(id)
  const used = await ShopSpu.count({ where: { brandId: id, tenantId: tid() } })
  if (used > 0) throw new AppError(400, `品牌已被 ${used} 个商品使用，无法删除`)
  await row.destroy()
}

export async function getBrandOptions(): Promise<Array<{ id: number; name: string }>> {
  const rows = await ShopBrand.findAll({ where: { tenantId: tid() }, order: [['name', 'ASC']], attributes: ['id', 'name'] })
  return rows.map((r) => ({ id: r.id, name: r.name }))
}
