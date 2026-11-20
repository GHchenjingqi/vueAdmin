import { Op } from 'sequelize'
import PromptCategory from '../models/PromptCategory.js'
import Prompt from '../models/Prompt.js'
import { AppError } from '../../../middleware/errorHandler.js'

export interface CategoryQuery {
  page?: number
  pageSize?: number
  keyword?: string
  status?: number | string
}

export interface CategoryInput {
  name?: string
  description?: string | null
  sort?: number
  status?: number
}

function normalizePage(params: CategoryQuery) {
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

/** 后台分类列表，附带每个分类下未删除的提示词数量 */
export async function listCategories(params: CategoryQuery) {
  const { page, pageSize, offset } = normalizePage(params)
  const where: any = {}
  if (params.keyword) where.name = { [Op.like]: `%${params.keyword}%` }
  if (params.status !== undefined && params.status !== '') where.status = Number(params.status)

  const { rows, count } = await PromptCategory.findAndCountAll({
    where,
    order: [
      ['sort', 'ASC'],
      ['id', 'ASC'],
    ],
    offset,
    limit: pageSize,
  })

  // 一条提示词可归属多个分类，需按 categoryIds 逐项统计；老数据回退到主分类
  const promptCategories = await Prompt.findAll({
    attributes: ['id', 'categoryId', 'categoryIds'],
    where: { isDeleted: 0 },
    raw: true,
  })
  const countMap = new Map<number, number>()
  for (const item of promptCategories as any[]) {
    const ids = Array.isArray(item.categoryIds) && item.categoryIds.length ? item.categoryIds : [item.categoryId]
    for (const raw of ids) {
      const id = Number(raw)
      if (Number.isFinite(id)) countMap.set(id, (countMap.get(id) ?? 0) + 1)
    }
  }

  return { rows: rows.map((row) => ({ ...row.toJSON(), promptCount: countMap.get(row.id) ?? 0 })), total: count, page, pageSize }
}

/** 启用中的分类，供下拉选择 */
export async function listCategoryOptions() {
  return PromptCategory.findAll({
    where: { status: 1 },
    order: [
      ['sort', 'ASC'],
      ['id', 'ASC'],
    ],
  })
}

export async function createCategory(data: CategoryInput) {
  const name = data.name?.trim()
  if (!name) throw new AppError(400, '分类名称不能为空')
  const exists = await PromptCategory.findOne({ where: { name } })
  if (exists) throw new AppError(400, '分类名称已存在')
  return PromptCategory.create({
    name,
    description: data.description ?? null,
    sort: data.sort ?? 0,
    status: data.status ?? 1,
  })
}

export async function updateCategory(id: number, data: CategoryInput) {
  const category = await PromptCategory.findByPk(id)
  if (!category) throw new AppError(404, '分类不存在')
  if (data.name !== undefined) {
    const name = data.name.trim()
    if (!name) throw new AppError(400, '分类名称不能为空')
    const exists = await PromptCategory.findOne({ where: { name, id: { [Op.ne]: id } } })
    if (exists) throw new AppError(400, '分类名称已存在')
    data = { ...data, name }
  }
  await category.update(data)
  return category
}

/** 分类删除保护：被提示词引用时拒绝删除，要求先迁移或停用 */
export async function deleteCategory(id: number) {
  const category = await PromptCategory.findByPk(id)
  if (!category) throw new AppError(404, '分类不存在')
  const referenced = await Prompt.count({
    where: {
      isDeleted: 0,
      [Op.or]: [{ categoryId: id }, { categoryIds: { [Op.contains]: [id] } }],
    },
  })
  if (referenced > 0) {
    throw new AppError(409, `该分类下还有 ${referenced} 条提示词，请先迁移或停用该分类`)
  }
  await category.destroy()
}

/** 校验分类可用于发布：必须存在且启用 */
export async function assertCategoryUsable(categoryId: number) {
  const category = await PromptCategory.findByPk(categoryId)
  if (!category) throw new AppError(400, '分类不存在')
  if (category.status !== 1) throw new AppError(400, '分类已停用，请选择其他分类')
  return category
}
