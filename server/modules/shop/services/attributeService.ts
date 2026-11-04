import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { ShopAttribute } from '../models/index.js'
import type { CreateAttributeInput, UpdateAttributeInput } from '../../../shared/schemas/shop.js'

export async function listAttributes(params: { page?: number; pageSize?: number; keyword?: string; categoryId?: number }) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where: Record<string, unknown> = {}
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
  const row = await ShopAttribute.findByPk(id)
  if (!row) throw new AppError(404, '属性不存在')
  return row
}

export async function createAttribute(input: CreateAttributeInput): Promise<ShopAttribute> {
  return ShopAttribute.create(input as never)
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
  const where: Record<string, unknown> = categoryId ? { [Op.or]: [{ categoryId }, { categoryId: null }] } : {}
  const rows = await ShopAttribute.findAll({ where, order: [['sort', 'ASC'], ['id', 'ASC']] })
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, options: r.options }))
}
