/** 用户收藏服务（幂等） */
import { Op } from 'sequelize'
import Prompt from '../models/Prompt.js'
import PromptFavorite from '../models/PromptFavorite.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { decorate, normalizePage, type PromptQuery } from './promptService.js'

export async function addFavorite(userId: number, promptId: number) {
  const prompt = await Prompt.findOne({ where: { id: promptId, status: 'published', isDeleted: 0 } })
  if (!prompt) throw new AppError(404, '提示词不存在或已下架')
  await PromptFavorite.findOrCreate({ where: { userId, promptId }, defaults: { userId, promptId } })
  return { favorited: true }
}

export async function removeFavorite(userId: number, promptId: number) {
  await PromptFavorite.destroy({ where: { userId, promptId } })
  return { favorited: false }
}

export async function listFavorites(userId: number, params: PromptQuery) {
  const { page, pageSize, offset } = normalizePage(params)
  const { rows, count } = await PromptFavorite.findAndCountAll({
    where: { userId },
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    offset,
    limit: pageSize,
  })
  const promptIds = rows.map((row) => row.promptId)
  const prompts = promptIds.length ? await Prompt.findAll({ where: { id: { [Op.in]: promptIds }, status: 'published', isDeleted: 0 } }) : []
  const decorated = await decorate(prompts)
  const orderMap = new Map(promptIds.map((id, index) => [id, index]))
  decorated.sort((a: any, b: any) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))
  return { rows: decorated.map((row) => ({ ...row, isFavorited: true })), total: count, page, pageSize }
}
