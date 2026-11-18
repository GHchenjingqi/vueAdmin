import Prompt from '../models/Prompt.js'
import PromptImage from '../models/PromptImage.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { listPrompts, getPromptById, type PromptQuery } from './promptService.js'

/** 待审核投稿列表 */
export async function listPending(params: PromptQuery) {
  return listPrompts({ ...params, status: 'pending', source: 'user' })
}

async function findPending(id: number) {
  const prompt = await Prompt.findOne({ where: { id, isDeleted: 0 } })
  if (!prompt) throw new AppError(404, '投稿不存在')
  if (prompt.status !== 'pending') throw new AppError(400, '该投稿不是待审核状态')
  return prompt
}

export async function approve(id: number, reviewerId: number) {
  const prompt = await findPending(id)
  const imageCount = await PromptImage.count({ where: { promptId: id } })
  if (imageCount === 0) throw new AppError(400, '投稿缺少效果图，无法通过审核')
  await prompt.update({ status: 'published', rejectReason: null, reviewedBy: reviewerId, reviewedAt: new Date() })
  return getPromptById(id)
}

export async function reject(id: number, reason: string, reviewerId: number) {
  const prompt = await findPending(id)
  const text = reason?.trim()
  if (!text) throw new AppError(400, '驳回理由不能为空')
  await prompt.update({ status: 'rejected', rejectReason: text, reviewedBy: reviewerId, reviewedAt: new Date() })
  return getPromptById(id)
}
