/**
 * 提示词前台公开服务
 *
 * 只暴露 status=published 且未删除的数据；与后台共用 prompts 表，
 * 因此后台审核通过后内容会立即出现在前台。
 */
import { Op } from 'sequelize'
import sequelize from '../../../config/database.js'
import User from '../../../models/User.js'
import Prompt from '../models/Prompt.js'
import PromptCategory from '../models/PromptCategory.js'
import PromptFavorite from '../models/PromptFavorite.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { decorate, normalizePage, type PromptQuery } from './promptService.js'

export interface PortalQuery extends PromptQuery {
  sort?: string
}

/** 补充作者名、收藏数、当前用户是否已收藏 */
async function withSocial(rows: any[], userId?: number) {
  const authorIds = Array.from(new Set(rows.map((row) => row.authorId).filter(Boolean))) as number[]
  const authors = authorIds.length ? await User.findAll({ where: { id: { [Op.in]: authorIds } }, attributes: ['id', 'username', 'nickname'] }) : []
  const authorMap = new Map(authors.map((user) => [user.id, user.nickname || user.username]))

  const promptIds = rows.map((row) => row.id)
  const favoriteCounts = promptIds.length
    ? ((await PromptFavorite.findAll({
        attributes: ['promptId', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
        where: { promptId: { [Op.in]: promptIds } },
        group: ['promptId'],
        raw: true,
      })) as any[])
    : []
  const countMap = new Map(favoriteCounts.map((item) => [Number(item.promptId), Number(item.cnt)]))

  let favorited = new Set<number>()
  if (userId && promptIds.length) {
    const records = await PromptFavorite.findAll({ where: { userId, promptId: { [Op.in]: promptIds } } })
    favorited = new Set(records.map((record) => record.promptId))
  }

  return rows.map((row) => ({
    ...row,
    authorName: authorMap.get(row.authorId) ?? '匿名用户',
    favoriteCount: countMap.get(row.id) ?? 0,
    isFavorited: favorited.has(row.id),
  }))
}

/** 启用分类 + 各分类下已发布数量 */
export async function listPublishedCategories() {
  const categories = await PromptCategory.findAll({
    where: { status: 1 },
    order: [
      ['sort', 'ASC'],
      ['id', 'ASC'],
    ],
  })
  const counts = (await Prompt.findAll({
    attributes: ['categoryId', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
    where: { status: 'published', isDeleted: 0 },
    group: ['categoryId'],
    raw: true,
  })) as any[]
  const countMap = new Map(counts.map((item) => [Number(item.categoryId), Number(item.cnt)]))
  return categories.map((category) => ({ ...category.toJSON(), promptCount: countMap.get(category.id) ?? 0 }))
}

/** 公开列表：仅已发布，支持关键词/分类/排序 */
export async function listPublishedPrompts(params: PortalQuery, userId?: number) {
  const { page, pageSize, offset } = normalizePage(params)
  const where: any = { status: 'published', isDeleted: 0 }
  if (params.keyword) {
    const like = `%${params.keyword}%`
    where[Op.or] = [{ title: { [Op.like]: like } }, { content: { [Op.like]: like } }, { modelName: { [Op.like]: like } }]
  }
  if (params.categoryId !== undefined && params.categoryId !== '') where.categoryId = Number(params.categoryId)

  const order: any[] =
    params.sort === 'popular'
      ? [
          ['viewCount', 'DESC'],
          ['id', 'DESC'],
        ]
      : [
          ['createdAt', 'DESC'],
          ['id', 'DESC'],
        ]

  const { rows, count } = await Prompt.findAndCountAll({ where, order, offset, limit: pageSize })
  const decorated = await decorate(rows)
  return { rows: await withSocial(decorated, userId), total: count, page, pageSize }
}

/** 公开详情：浏览量自增，返回图集与收藏状态 */
export async function getPublishedPrompt(id: number, userId?: number) {
  const prompt = await Prompt.findOne({ where: { id, status: 'published', isDeleted: 0 } })
  if (!prompt) throw new AppError(404, '提示词不存在或已下架')
  await prompt.increment('viewCount')
  // increment 不会刷新当前实例，需 reload 后再序列化，否则详情返回旧浏览量
  await prompt.reload()
  const [decorated] = await decorate([prompt])
  const [result] = await withSocial([decorated], userId)
  return result
}

/** 同分类相关推荐 */
export async function listRelated(id: number, userId?: number, limit = 4) {
  const current = await Prompt.findOne({ where: { id, status: 'published', isDeleted: 0 } })
  if (!current) return []
  const rows = await Prompt.findAll({
    where: { categoryId: current.categoryId, status: 'published', isDeleted: 0, id: { [Op.ne]: id } },
    order: [
      ['viewCount', 'DESC'],
      ['id', 'DESC'],
    ],
    limit,
  })
  return withSocial(await decorate(rows), userId)
}
