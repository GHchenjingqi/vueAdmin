import { Op, Transaction } from 'sequelize'
import sequelize from '../../../config/database.js'
import Prompt from '../models/Prompt.js'
import PromptCategory from '../models/PromptCategory.js'
import PromptImage from '../models/PromptImage.js'
import PromptFavorite from '../models/PromptFavorite.js'
import PromptPlatform from '../models/PromptPlatform.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { assertCategoryUsable } from './categoryService.js'
import { assertPlatformUsable, getDefaultPlatformId } from './platformService.js'

export const IMAGES_PER_GROUP = 20

export interface PromptImageInput {
  url: string
  filePath?: string | null
  sort?: number
  isCover?: boolean
}

export interface PromptImageGroupInput {
  platformId: number
  images: PromptImageInput[]
}

export interface PromptInput {
  title?: string
  content?: string
  categoryId?: number
  modelName?: string
  action?: 'publish' | 'draft'
  images?: PromptImageInput[]
  platformGroups?: PromptImageGroupInput[]
}

// 新结构 platformGroups=[{platformId, images}]；旧结构 images=[...] 归入默认平台
export function inputGroups(data: PromptInput): PromptImageGroupInput[] {
  const raw: any = data.platformGroups ?? data.images
  if (!Array.isArray(raw)) return []
  return raw.some((item) => item && Array.isArray(item.images))
    ? (raw as PromptImageGroupInput[])
    : [{ platformId: 0, images: raw as PromptImageInput[] }]
}

export function countInputImages(data: PromptInput): number {
  return inputGroups(data).reduce((sum, group) => sum + (group.images?.length || 0), 0)
}

export interface PromptQuery {
  page?: number
  pageSize?: number
  keyword?: string
  categoryId?: number | string
  status?: string
  source?: string
}

export function normalizePage(params: PromptQuery) {
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export async function replaceImages(promptId: number, data: PromptInput, transaction: Transaction) {
  await PromptImage.destroy({ where: { promptId }, transaction })
  const defaultPlatformId = await getDefaultPlatformId()
  for (const group of inputGroups(data)) {
    const platformId = Number(group.platformId) || defaultPlatformId
    const images = Array.isArray(group.images) ? group.images.slice(0, IMAGES_PER_GROUP) : []
    const explicitCover = images.findIndex((image) => image.isCover)
    const coverIndex = explicitCover >= 0 ? explicitCover : 0
    if (!images.length) continue
    await PromptImage.bulkCreate(
      images.map((image, index) => ({
        promptId,
        platformId,
        url: image.url,
        filePath: image.filePath ?? null,
        sort: image.sort ?? index,
        isCover: index === coverIndex ? 1 : 0,
      })),
      { transaction },
    )
  }
}

export async function decorate(rows: Prompt[]) {
  const categoryIds = Array.from(new Set(rows.map((row) => row.categoryId)))
  const categories = categoryIds.length ? await PromptCategory.findAll({ where: { id: { [Op.in]: categoryIds } } }) : []
  const categoryMap = new Map(categories.map((category) => [category.id, category.name]))
  const platforms = await PromptPlatform.findAll()
  const platformMap = new Map(platforms.map((platform) => [platform.id, platform.name]))

  const promptIds = rows.map((row) => row.id)
  const images = promptIds.length
    ? await PromptImage.findAll({
        where: { promptId: { [Op.in]: promptIds } },
        order: [
          ['sort', 'ASC'],
          ['id', 'ASC'],
        ],
      })
    : []
  const imageMap = new Map<number, any[]>()
  for (const image of images) {
    const list = imageMap.get(image.promptId) ?? []
    list.push(image.toJSON())
    imageMap.set(image.promptId, list)
  }

  return rows.map((row) => {
    const rowImages = imageMap.get(row.id) ?? []
    const groupMap = new Map<number, any>()
    for (const image of rowImages) {
      const platformId = Number(image.platformId) || 1
      if (!groupMap.has(platformId)) {
        groupMap.set(platformId, { platformId, platformName: platformMap.get(platformId) ?? '通用', images: [], coverImage: '' })
      }
      groupMap.get(platformId).images.push(image)
    }
    const platformGroups = Array.from(groupMap.values()).map((group) => ({
      ...group,
      coverImage: group.images.find((image: any) => image.isCover === 1)?.url ?? group.images[0]?.url ?? '',
    }))
    return {
      ...row.toJSON(),
      categoryName: categoryMap.get(row.categoryId) ?? '',
      images: rowImages,
      platformGroups,
      coverImage: rowImages.find((image) => image.isCover === 1)?.url ?? rowImages[0]?.url ?? '',
    }
  })
}

export async function listPrompts(params: PromptQuery) {
  const { page, pageSize, offset } = normalizePage(params)
  const where: any = { isDeleted: 0 }
  if (params.keyword) where.title = { [Op.like]: `%${params.keyword}%` }
  if (params.categoryId !== undefined && params.categoryId !== '') where.categoryId = Number(params.categoryId)
  if (params.status) where.status = params.status
  if (params.source) where.source = params.source

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

export async function getPromptById(id: number) {
  const prompt = await Prompt.findOne({ where: { id, isDeleted: 0 } })
  if (!prompt) throw new AppError(404, '提示词不存在')
  const [decorated] = await decorate([prompt])
  return decorated
}

export async function validateInput(data: PromptInput, requireImage: boolean) {
  if (!data.title?.trim()) throw new AppError(400, '标题不能为空')
  if (!data.content?.trim()) throw new AppError(400, '提示词正文不能为空')
  if (!data.modelName?.trim()) throw new AppError(400, '模型名称不能为空')
  if (!data.categoryId) throw new AppError(400, '请选择分类')
  const groups = inputGroups(data)
  if (requireImage && countInputImages(data) === 0) {
    throw new AppError(400, '正式发布的提示词必须上传至少一张效果图')
  }
  if (groups.some((group) => (group.images?.length || 0) > IMAGES_PER_GROUP)) {
    throw new AppError(400, `每个平台最多上传 ${IMAGES_PER_GROUP} 张效果图`)
  }
  const defaultPlatformId = await getDefaultPlatformId()
  for (const group of groups) {
    await assertPlatformUsable(Number(group.platformId) || defaultPlatformId)
  }
}

export async function createPrompt(data: PromptInput, authorId: number) {
  const status = data.action === 'publish' ? 'published' : 'draft'
  await validateInput(data, status === 'published')
  await assertCategoryUsable(Number(data.categoryId))

  const promptId = await sequelize.transaction(async (transaction) => {
    const prompt = await Prompt.create(
      {
        title: data.title!.trim(),
        content: data.content!.trim(),
        categoryId: Number(data.categoryId),
        modelName: data.modelName!.trim(),
        status,
        source: 'admin',
        authorId,
      },
      { transaction },
    )
    if (countInputImages(data) > 0) await replaceImages(prompt.id, data, transaction)
    return prompt.id
  })
  return getPromptById(promptId)
}

export async function updatePrompt(id: number, data: PromptInput) {
  const prompt = await Prompt.findOne({ where: { id, isDeleted: 0 } })
  if (!prompt) throw new AppError(404, '提示词不存在')
  const targetStatus = data.action === 'publish' ? 'published' : prompt.status
  const existingImageCount = await PromptImage.count({ where: { promptId: id } })
  const willHaveImages = data.platformGroups !== undefined || data.images !== undefined ? countInputImages(data) > 0 : existingImageCount > 0
  if (targetStatus === 'published' && !willHaveImages) throw new AppError(400, '正式发布的提示词必须上传至少一张效果图')
  await validateInput(data, false)
  await assertCategoryUsable(Number(data.categoryId))

  await sequelize.transaction(async (transaction) => {
    await prompt.update(
      {
        title: data.title!.trim(),
        content: data.content!.trim(),
        categoryId: Number(data.categoryId),
        modelName: data.modelName!.trim(),
        ...(targetStatus !== prompt.status ? { status: targetStatus } : {}),
      },
      { transaction },
    )
    if (data.platformGroups !== undefined || data.images !== undefined) await replaceImages(id, data, transaction)
  })
  return getPromptById(id)
}

export async function publishPrompt(id: number) {
  const prompt = await Prompt.findOne({ where: { id, isDeleted: 0 } })
  if (!prompt) throw new AppError(404, '提示词不存在')
  const imageCount = await PromptImage.count({ where: { promptId: id } })
  if (imageCount === 0) throw new AppError(400, '没有效果图，无法发布')
  await prompt.update({ status: 'published', rejectReason: null })
  return getPromptById(id)
}

export async function offlinePrompt(id: number) {
  const prompt = await Prompt.findOne({ where: { id, isDeleted: 0 } })
  if (!prompt) throw new AppError(404, '提示词不存在')
  await prompt.update({ status: 'offline' })
  return getPromptById(id)
}

/** 软删除提示词，保留图片记录与文件，避免误删被其他业务引用的文件 */
export async function deletePrompt(id: number) {
  const prompt = await Prompt.findOne({ where: { id, isDeleted: 0 } })
  if (!prompt) throw new AppError(404, '提示词不存在')
  await prompt.update({ isDeleted: 1, status: 'offline' })
}

export async function stats() {
  const base = { isDeleted: 0 }
  const [total, published, pending, categories, favorites, offline] = await Promise.all([
    Prompt.count({ where: base }),
    Prompt.count({ where: { ...base, status: 'published' } }),
    Prompt.count({ where: { ...base, status: 'pending' } }),
    PromptCategory.count({ where: { status: 1 } }),
    PromptFavorite.count(),
    Prompt.count({ where: { ...base, status: 'offline' } }),
  ])
  return { total, published, pending, offline, categories, favorites }
}
