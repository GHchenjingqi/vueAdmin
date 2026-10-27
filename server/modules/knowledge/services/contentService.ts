import { Op } from 'sequelize'
import KnowledgeContent from '../models/Content.js'
import KnowledgeContentTag from '../models/ContentTag.js'
import KnowledgeCategory from '../models/Category.js'
import KnowledgeTag from '../models/Tag.js'
import { AppError } from '../../../middleware/errorHandler.js'

export async function listContents(page: number, pageSize: number, filters: { keyword?: string; categoryId?: number; tagId?: number; status?: string }) {
  const where: any = {}
  if (filters.keyword) {
    where[Op.or] = [{ title: { [Op.like]: `%${filters.keyword}%` } }, { summary: { [Op.like]: `%${filters.keyword}%` } }]
  }
  if (filters.categoryId) {
    where.categoryId = filters.categoryId
  }
  if (filters.status) {
    where.status = filters.status
  }

  const offset = (page - 1) * pageSize

  let contentIds: number[] | undefined
  if (filters.tagId) {
    const contentTagRows = await KnowledgeContentTag.findAll({
      where: { tagId: filters.tagId },
      attributes: ['contentId'],
    })
    contentIds = contentTagRows.map((r) => r.contentId)
    if (contentIds.length === 0) {
      return { rows: [], total: 0 }
    }
    where.id = { [Op.in]: contentIds }
  }

  const { rows, count } = await KnowledgeContent.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    offset,
    limit: pageSize,
  })

  // N+1 优化：批量加载分类名与标签（原来每行各发 3 次查询），Map 关联回填
  const categoryIds = [...new Set(rows.map((r) => r.categoryId).filter((id): id is number => !!id))]
  const categories = categoryIds.length > 0
    ? await KnowledgeCategory.findAll({ where: { id: { [Op.in]: categoryIds } }, attributes: ['id', 'name'] })
    : []
  const categoryMap = new Map<number, string>(categories.map((c) => [c.id, c.name]))

  const rowIds = rows.map((r) => r.id)
  const tagLinks = rowIds.length > 0
    ? await KnowledgeContentTag.findAll({ where: { contentId: { [Op.in]: rowIds } }, attributes: ['contentId', 'tagId'] })
    : []
  const tagIds = [...new Set(tagLinks.map((t) => t.tagId))]
  const tags = tagIds.length > 0
    ? await KnowledgeTag.findAll({ where: { id: { [Op.in]: tagIds } } })
    : []
  const tagMap = new Map(tags.map((t) => [t.id, t.toJSON()]))
  const tagsByContent = new Map<number, any[]>()
  for (const link of tagLinks) {
    const tag = tagMap.get(link.tagId)
    if (!tag) continue
    const arr = tagsByContent.get(link.contentId) || []
    arr.push(tag)
    tagsByContent.set(link.contentId, arr)
  }

  const contents = rows.map((row) => {
    const item: any = row.toJSON()
    if (item.categoryId) {
      item.categoryName = categoryMap.get(item.categoryId) || null
    }
    item.tags = tagsByContent.get(item.id) || []
    return item
  })

  return { rows: contents, total: count }
}

export async function getContentById(id: number) {
  const content = await KnowledgeContent.findByPk(id)
  if (!content) throw new AppError(404, '内容不存在')

  const item = content.toJSON() as any
  if (item.categoryId) {
    const cat = await KnowledgeCategory.findByPk(item.categoryId, { attributes: ['name'] })
    item.categoryName = cat?.get('name') || null
  }
  const tagLinks = await KnowledgeContentTag.findAll({
    where: { contentId: item.id },
    attributes: ['tagId'],
  })
  if (tagLinks.length > 0) {
    const tagIds = tagLinks.map((t) => t.tagId)
    const tags = await KnowledgeTag.findAll({ where: { id: { [Op.in]: tagIds } } })
    item.tags = tags.map((t) => t.toJSON())
  } else {
    item.tags = []
  }
  return item
}

function extractFirstImage(body: string): string | null {
  const match = body.match(/!\[.*?\]\(\s*([^\s()]+(?:\s+[^\s()]+)*?)\s*(?:["'][^"']*["'])?\s*\)/)
  return match ? match[1].trim() : null
}

export async function createContent(data: {
  title: string
  summary?: string
  body: string
  cover?: string | null
  categoryId?: number
  tagIds?: number[]
  author: string
  status?: string
}) {
  const cover = data.cover ? data.cover : extractFirstImage(data.body)
  const content = await KnowledgeContent.create({
    title: data.title,
    summary: data.summary || '',
    body: data.body,
    cover,
    categoryId: data.categoryId || null,
    author: data.author,
    status: data.status || 'draft',
    publishTime: data.status === 'published' ? new Date() : null,
  })

  if (data.tagIds && data.tagIds.length > 0) {
    await KnowledgeContentTag.bulkCreate(data.tagIds.map((tagId) => ({ contentId: content.id, tagId })))
  }

  return getContentById(content.id)
}

export async function updateContent(
  id: number,
  data: {
    title?: string
    summary?: string
    body?: string
    cover?: string | null
    categoryId?: number
    tagIds?: number[]
    status?: string
  },
) {
  const content = await KnowledgeContent.findByPk(id)
  if (!content) throw new AppError(404, '内容不存在')

  const updateData: any = { ...data }
  if (data.status === 'published' && content.get('status') !== 'published') {
    updateData.publishTime = new Date()
  }
  if (data.cover !== undefined) {
    updateData.cover = data.cover || extractFirstImage(data.body || '')
  } else if (data.body !== undefined) {
    const extracted = extractFirstImage(data.body)
    if (extracted) updateData.cover = extracted
  }
  delete updateData.tagIds
  await content.update(updateData)

  if (data.tagIds !== undefined) {
    await KnowledgeContentTag.destroy({ where: { contentId: id } })
    if (data.tagIds.length > 0) {
      await KnowledgeContentTag.bulkCreate(data.tagIds.map((tagId) => ({ contentId: id, tagId })))
    }
  }

  return getContentById(id)
}

export async function deleteContent(id: number) {
  const content = await KnowledgeContent.findByPk(id)
  if (!content) throw new AppError(404, '内容不存在')
  await KnowledgeContentTag.destroy({ where: { contentId: id } })
  await content.destroy()
}
