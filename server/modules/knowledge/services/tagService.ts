import { Op } from 'sequelize'
import KnowledgeTag from '../models/Tag.js'
import { AppError } from '../../../middleware/errorHandler.js'

export async function listTags(page: number, pageSize: number, keyword?: string) {
  const where: any = {}
  if (keyword) {
    where.name = { [Op.like]: `%${keyword}%` }
  }
  const offset = (page - 1) * pageSize
  const { rows, count } = await KnowledgeTag.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset,
    limit: pageSize,
  })
  return { rows, total: count }
}

export async function listTagOptions() {
  const tags = await KnowledgeTag.findAll({
    order: [['id', 'ASC']],
  })
  return tags
}

export async function getTagById(id: number) {
  const tag = await KnowledgeTag.findByPk(id)
  if (!tag) throw new AppError(404, '标签不存在')
  return tag
}

export async function createTag(data: { name: string; color?: string }) {
  const tag = await KnowledgeTag.create({
    name: data.name,
    color: data.color || '#409EFF',
  })
  return tag
}

export async function updateTag(id: number, data: { name?: string; color?: string }) {
  const tag = await KnowledgeTag.findByPk(id)
  if (!tag) throw new AppError(404, '标签不存在')
  await tag.update(data)
  return tag
}

export async function deleteTag(id: number) {
  const tag = await KnowledgeTag.findByPk(id)
  if (!tag) throw new AppError(404, '标签不存在')
  await tag.destroy()
}