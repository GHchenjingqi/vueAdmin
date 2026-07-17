/**
 * 字典类型管理 Service 层
 *
 * 职责：封装字典类型管理的所有业务逻辑
 */

import { Op } from 'sequelize'
import DictType from '../models/DictType.js'
import DictData from '../models/DictData.js'
import { AppError } from '../middleware/errorHandler.js'
import { refreshAllDictCache } from '../utils/dictCache.js'

/**
 * 获取字典类型列表
 */
export async function listDictTypes(query: {
  scope?: string
  page?: number
  pageSize?: number
  keyword?: string
}) {
  const { scope, page = 1, pageSize = 20, keyword } = query

  if (scope === 'all') {
    const types = await DictType.findAll({
      where: { status: 1 },
      attributes: ['id', 'name', 'type'],
      order: [['id', 'ASC']],
    })
    return types
  }

  const where = keyword
    ? { [Op.or]: [{ name: { [Op.like]: `%${keyword}%` } }, { type: { [Op.like]: `%${keyword}%` } }] }
    : {}

  const offset = (Number(page) - 1) * Number(pageSize)
  const { rows, count } = await DictType.findAndCountAll({
    where,
    order: [['id', 'ASC']],
    offset,
    limit: Number(pageSize),
  })

  return { rows, total: count }
}

/**
 * 获取单个字典类型
 */
export async function getDictTypeById(id: number) {
  const dictType = await DictType.findByPk(id)
  if (!dictType) throw new AppError(404, '字典类型不存在')
  return dictType
}

/**
 * 创建字典类型
 */
export async function createDictType(data: {
  name: string
  type: string
  status?: number
  remark?: string
}) {
  const { name, type, status, remark } = data
  if (!name || !type) throw new AppError(400, '字典名称和编码不能为空')

  const existing = await DictType.findOne({ where: { type } })
  if (existing) throw new AppError(409, `字典类型「${type}」已存在`)

  const dictType = await DictType.create({ name, type, status, remark })
  return { id: dictType.id }
}

/**
 * 更新字典类型
 */
export async function updateDictType(
  id: number,
  data: {
    name?: string
    type?: string
    status?: number
    remark?: string
  },
) {
  const dictType = await DictType.findByPk(id)
  if (!dictType) throw new AppError(404, '字典类型不存在')

  const { name, type, status, remark } = data

  if (type && type !== dictType.type) {
    const conflict = await DictType.findOne({ where: { type } })
    if (conflict) throw new AppError(409, `字典类型「${type}」已存在`)
  }

  await dictType.update({ name, type, status, remark })
}

/**
 * 删除字典类型（级联删除该类型下的所有字典数据）
 */
export async function deleteDictType(id: number) {
  const dictType = await DictType.findByPk(id)
  if (!dictType) throw new AppError(404, '字典类型不存在')

  await DictData.destroy({ where: { dictType: dictType.type } })
  await dictType.destroy()
}

/**
 * 获取所有启用字典类型（用于下拉选择器）
 */
export async function getAllActiveDictTypes() {
  return listDictTypes({ scope: 'all' })
}

/**
 * 刷新字典缓存
 */
export async function refreshDictCache() {
  const count = await refreshAllDictCache()
  return count
}