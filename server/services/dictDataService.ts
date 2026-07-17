/**
 * 字典数据管理 Service 层
 *
 * 职责：封装字典数据管理的所有业务逻辑
 */

import { Op } from 'sequelize'
import DictData from '../models/DictData.js'
import { AppError } from '../middleware/errorHandler.js'
import { getDictOptions } from '../utils/dictCache.js'

/**
 * 获取字典数据列表
 */
export async function listDictData(query: {
  scope?: string
  type?: string
  page?: number
  pageSize?: number
  dictType?: string
  keyword?: string
}) {
  const { scope, type, page = 1, pageSize = 20, dictType, keyword } = query

  if (scope === 'options') {
    if (!type) throw new AppError(400, '缺少字典类型参数 type')
    const items = await getDictOptions(type)
    return items
  }

  const where: Record<string, unknown> = {}

  if (dictType) where.dictType = dictType
  if (keyword) {
    where[Op.or] = [
      { label: { [Op.like]: `%${keyword}%` } },
      { value: { [Op.like]: `%${keyword}%` } },
    ]
  }

  const offset = (Number(page) - 1) * Number(pageSize)
  const { rows, count } = await DictData.findAndCountAll({
    where,
    order: [['sort', 'ASC'], ['id', 'ASC']],
    offset,
    limit: Number(pageSize),
  })

  return { rows, total: count }
}

/**
 * 获取单个字典数据
 */
export async function getDictDataById(id: number) {
  const item = await DictData.findByPk(id)
  if (!item) throw new AppError(404, '字典数据不存在')
  return item
}

/**
 * 创建字典数据
 */
export async function createDictData(data: {
  dictType: string
  label: string
  value: string
  sort?: number
  status?: number
  remark?: string
}) {
  const { dictType, label, value, sort, status, remark } = data
  if (!dictType || !label || !value) {
    throw new AppError(400, '字典类型、标签和值不能为空')
  }

  const item = await DictData.create({ dictType, label, value, sort, status, remark })
  return { id: item.id }
}

/**
 * 更新字典数据
 */
export async function updateDictData(
  id: number,
  data: {
    dictType?: string
    label?: string
    value?: string
    sort?: number
    status?: number
    remark?: string
  },
) {
  const item = await DictData.findByPk(id)
  if (!item) throw new AppError(404, '字典数据不存在')

  const { dictType, label, value, sort, status, remark } = data
  await item.update({ dictType, label, value, sort, status, remark })
}

/**
 * 删除字典数据
 */
export async function deleteDictData(id: number) {
  const item = await DictData.findByPk(id)
  if (!item) throw new AppError(404, '字典数据不存在')

  await item.destroy()
}

/**
 * 获取字典数据选项（用于下拉选择器）
 */
export async function getDictDataOptions(type: string) {
  return getDictOptions(type)
}