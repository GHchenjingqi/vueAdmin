/**
 * 用户投稿服务
 *
 * 与后台管理共用 prompts 表：source='user'、authorId=框架 users.id，
 * 提交后进入 status='pending'，由后台「投稿审核」统一处理。
 */
import { Op } from 'sequelize'
import sequelize from '../../../config/database.js'
import Prompt from '../models/Prompt.js'
import PromptImage from '../models/PromptImage.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { assertCategoryUsable } from './categoryService.js'
import { countInputImages, decorate, getPromptById, normalizePage, replaceImages, replaceSteps, validateInput, type PromptInput, type PromptQuery } from './promptService.js'

export interface PortalPromptInput extends PromptInput {
  /** true=提交审核；false/undefined=存草稿 */
  submit?: boolean
}

/** 只能操作自己的投稿 */
async function assertOwned(id: number, userId: number) {
  const prompt = await Prompt.findOne({ where: { id, authorId: userId, source: 'user', isDeleted: 0 } })
  if (!prompt) throw new AppError(404, '投稿不存在')
  return prompt
}

function assertEditable(prompt: Prompt): void {
  if (prompt.status !== 'draft' && prompt.status !== 'rejected') {
    throw new AppError(400, '只有草稿或被驳回的投稿可以修改')
  }
}

export async function createUserPrompt(data: PortalPromptInput, userId: number) {
  const submitting = data.submit === true
  await validateInput(data, submitting)
  await assertCategoryUsable(Number(data.categoryId))

  const promptId = await sequelize.transaction(async (transaction) => {
    const prompt = await Prompt.create(
      {
        title: data.title!.trim(),
        content: data.content!.trim(),
        categoryId: Number(data.categoryId),
        modelName: data.modelName!.trim(),
        type: data.type === 'sequence' ? 'sequence' : 'single',
        characterAnchor: data.type === 'sequence' ? data.characterAnchor?.trim() || null : null,
        status: submitting ? 'pending' : 'draft',
        source: 'user',
        authorId: userId,
      },
      { transaction },
    )
    if (data.type === 'sequence') await replaceSteps(prompt.id, data, transaction)
    else if (countInputImages(data) > 0) await replaceImages(prompt.id, data, transaction)
    return prompt.id
  })
  return getPromptById(promptId)
}

export async function listMine(userId: number, params: PromptQuery) {
  const { page, pageSize, offset } = normalizePage(params)
  const where: any = { authorId: userId, source: 'user', isDeleted: 0 }
  if (params.status) where.status = params.status
  if (params.keyword) where.title = { [Op.like]: `%${params.keyword}%` }

  const { rows, count } = await Prompt.findAndCountAll({
    where,
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    offset,
    limit: pageSize,
  })
  return { rows: await decorate(rows), total: count, page, pageSize }
}

export async function getMine(id: number, userId: number) {
  const prompt = await assertOwned(id, userId)
  return getPromptById(prompt.id)
}

export async function updateUserPrompt(id: number, userId: number, data: PortalPromptInput) {
  const prompt = await assertOwned(id, userId)
  assertEditable(prompt)

  const existingImageCount = await PromptImage.count({ where: { promptId: id } })
  const hasImagePayload = data.platformGroups !== undefined || data.images !== undefined || data.steps !== undefined
  const willHaveImages = hasImagePayload ? countInputImages(data) > 0 : existingImageCount > 0
  const submitting = data.submit === true
  if (submitting && !willHaveImages) throw new AppError(400, '提交审核必须上传至少一张效果图')
  await validateInput(data, false)
  await assertCategoryUsable(Number(data.categoryId))

  await sequelize.transaction(async (transaction) => {
    await prompt.update(
      {
        title: data.title!.trim(),
        content: data.content!.trim(),
        categoryId: Number(data.categoryId),
        modelName: data.modelName!.trim(),
        type: data.type === 'sequence' ? 'sequence' : 'single',
        characterAnchor: data.type === 'sequence' ? data.characterAnchor?.trim() || null : null,
        ...(submitting ? { status: 'pending', rejectReason: null, reviewedBy: null, reviewedAt: null } : {}),
      },
      { transaction },
    )
    if (data.type === 'sequence') await replaceSteps(id, data, transaction)
    else if (data.platformGroups !== undefined || data.images !== undefined) await replaceImages(id, data, transaction)
  })
  return getPromptById(id)
}

export async function submitUserPrompt(id: number, userId: number) {
  const prompt = await assertOwned(id, userId)
  assertEditable(prompt)
  const imageCount = await PromptImage.count({ where: { promptId: id } })
  if (imageCount === 0) throw new AppError(400, '没有效果图，无法提交审核')
  await prompt.update({ status: 'pending', rejectReason: null, reviewedBy: null, reviewedAt: null })
  return getPromptById(id)
}

export async function deleteUserPrompt(id: number, userId: number) {
  const prompt = await assertOwned(id, userId)
  if (prompt.status === 'published') throw new AppError(400, '已发布的投稿请联系管理员下架后再删除')
  await prompt.update({ isDeleted: 1, status: 'offline' })
}
