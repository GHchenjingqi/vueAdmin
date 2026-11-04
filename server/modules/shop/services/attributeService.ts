import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { ShopAttribute } from '../models/index.js'
import type { CreateAttributeInput, UpdateAttributeInput } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

export async function listAttributes(params: { page?: number; pageSize?: number; keyword?: string; categoryId?: number }) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where: Record<string, unknown> = { tenantId: tid() }
  if (params.keyword) where.name = { [Op.like]: `%${params.keyword}%` }
  if (params.categoryId) where.categoryId = params.categoryId
  const { rows, count } = await ShopAttribute.findAndCountAll({
    where,
    order: [['sort', 'ASC'], ['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

export async function getAttributeById(id: number): Promise<ShopAttribute> {
  const row = await ShopAttribute.findOne({ where: { id, tenantId: tid() } })
  if (!row) throw new AppError(404, '属性不存在')
  return row
}

export async function createAttribute(input: CreateAttributeInput): Promise<ShopAttribute> {
  return ShopAttribute.create({ ...input, tenantId: getTenantContext()?.tenantId ?? 1 } as never)
}

export async function updateAttribute(id: number, input: UpdateAttributeInput): Promise<ShopAttribute> {
  const row = await getAttributeById(id)
  await row.update(input as never)
  return row
}

export async function deleteAttribute(id: number): Promise<void> {
  const row = await getAttributeById(id)
  await row.destroy()
}

/** 属性选项（SKU 规格组合录入用） */
export async function getAttributeOptions(categoryId?: number): Promise<Array<{ id: number; name: string; type: string; options: string[] | null }>> {
  const where: Record<string | symbol, unknown> = { tenantId: tid() }
  if (categoryId) where[Op.or] = [{ categoryId }, { categoryId: null }]
  const rows = await ShopAttribute.findAll({ where, order: [['sort', 'ASC'], ['id', 'ASC']] })
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, options: r.options }))
}
