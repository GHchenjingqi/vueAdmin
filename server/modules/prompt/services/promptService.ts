import { Op, Transaction } from 'sequelize'
import sequelize from '../../../config/database.js'
import Prompt from '../models/Prompt.js'
import PromptCategory from '../models/PromptCategory.js'
import PromptImage from '../models/PromptImage.js'
import PromptStep from '../models/PromptStep.js'
import PromptFavorite from '../models/PromptFavorite.js'
import PromptPlatform from '../models/PromptPlatform.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { assertCategoryUsable } from './categoryService.js'
import { assertPlatformUsable, getDefaultPlatformId } from './platformService.js'

export const IMAGES_PER_GROUP = 20
/** 套组每一步、每个平台仅 1 张代表性效果图，避免同一步多图造成角色漂移 */
export const IMAGES_PER_STEP_GROUP = 1
export const MAX_STEPS = 100
export const MAX_CATEGORIES = 10
export const MAX_CHAIN_DEPTH = 20

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

/** 套组中的一步：动作提示词 + 该步按平台分组的效果图 */
export interface PromptStepInput {
  id?: number
  stepOrder?: number
  name: string
  actionPrompt: string
  camera?: string | null
  seconds?: number | null
  transition?: string | null
  platformGroups?: PromptImageGroupInput[]
}

export interface PromptInput {
  id?: number
  title?: string
  content?: string
  categoryId?: number | string
  categoryIds?: Array<number | string> | null
  parentId?: number | string | null
  modelName?: string
  action?: 'publish' | 'draft'
  imageUrl?: string
  images?: PromptImageInput[]
  platformGroups?: PromptImageGroupInput[]
  type?: 'single' | 'sequence'
  characterAnchor?: string | null
  steps?: PromptStepInput[]
}

/** 分类多选：优先取 categoryIds，未传时回退到 categoryId，兼容用户投稿等旧调用方 */
export function resolveCategoryIds(data: { categoryId?: number | string | null; categoryIds?: Array<number | string> | null }): number[] {
  const raw = Array.isArray(data.categoryIds) && data.categoryIds.length ? data.categoryIds : [data.categoryId]
  return Array.from(new Set(raw.map(Number).filter((id) => Number.isFinite(id) && id > 0)))
}

/** 关联父提示词校验：必须已发布，且不能是当前提示词或其后代（防环） */
export async function assertParentValid(parentId: number | string | null | undefined, currentId?: number | null): Promise<number | null> {
  if (parentId === undefined || parentId === null || parentId === '') return null
  const id = Number(parentId)
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, '关联的提示词无效')
  if (currentId && id === currentId) throw new AppError(400, '不能关联自己')

  const parent = await Prompt.findOne({ where: { id, isDeleted: 0 } })
  if (!parent) throw new AppError(400, '关联的提示词不存在')
  if (parent.status !== 'published') throw new AppError(400, '只能关联已发布的提示词')

  let cursor = parent
  const seen = new Set<number>([id])
  for (let depth = 0; cursor.parentId && depth < MAX_CHAIN_DEPTH; depth += 1) {
    if (currentId && cursor.parentId === currentId) throw new AppError(400, '不能关联自己的下游提示词')
    if (seen.has(cursor.parentId)) break
    seen.add(cursor.parentId)
    const ancestor = await Prompt.findByPk(cursor.parentId)
    if (!ancestor) break
    cursor = ancestor
  }
  return id
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
  if (data.type === 'sequence') {
    return (data.steps ?? []).reduce(
      (sum, step) => sum + (step.platformGroups ?? []).reduce((sub, group) => sub + (group.images?.length || 0), 0),
      0,
    )
  }
  return inputGroups(data).reduce((sum, group) => sum + (group.images?.length || 0), 0)
}

export interface PromptQuery {
  page?: number
  pageSize?: number
  keyword?: string
  categoryId?: number | string
  status?: string
  source?: string
  type?: string
}

export function normalizePage(params: PromptQuery) {
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

/** 单条提示词的图片写入（stepId 为 NULL） */
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
        stepId: null,
        url: image.url,
        filePath: image.filePath ?? null,
        sort: image.sort ?? index,
        isCover: index === coverIndex ? 1 : 0,
      })),
      { transaction },
    )
  }
}

/** 套组：重建步骤及每步图片（每步每平台仅 1 张） */
export async function replaceSteps(promptId: number, data: PromptInput, transaction: Transaction) {
  await PromptImage.destroy({ where: { promptId }, transaction })
  await PromptStep.destroy({ where: { promptId }, transaction })
  const defaultPlatformId = await getDefaultPlatformId()
  const steps = data.steps ?? []
  for (const [index, step] of steps.entries()) {
    const created = await PromptStep.create(
      {
        promptId,
        stepOrder: Number(step.stepOrder) || index + 1,
        name: step.name.trim(),
        actionPrompt: step.actionPrompt.trim(),
        camera: step.camera?.trim() || null,
        seconds: Number.isFinite(Number(step.seconds)) ? Number(step.seconds) : null,
        transition: step.transition?.trim() || null,
      },
      { transaction },
    )
    for (const group of step.platformGroups ?? []) {
      const platformId = Number(group.platformId) || defaultPlatformId
      const images = (Array.isArray(group.images) ? group.images : []).slice(0, IMAGES_PER_STEP_GROUP)
      if (!images.length) continue
      await PromptImage.bulkCreate(
        images.map((image, imageIndex) => ({
          promptId,
          platformId,
          stepId: created.id,
          url: image.url,
          filePath: image.filePath ?? null,
          sort: imageIndex,
          isCover: imageIndex === 0 ? 1 : 0,
        })),
        { transaction },
      )
    }
  }
}

function groupImagesByPlatform(images: any[], platformMap: Map<number, string>) {
  const groupMap = new Map<number, any>()
  for (const image of images) {
    const platformId = Number(image.platformId) || 1
    if (!groupMap.has(platformId)) {
      groupMap.set(platformId, { platformId, platformName: platformMap.get(platformId) ?? '通用', images: [], coverImage: '' })
    }
    groupMap.get(platformId).images.push(image)
  }
  return Array.from(groupMap.values()).map((group) => ({
    ...group,
    coverImage: group.images.find((image: any) => image.isCover === 1)?.url ?? group.images[0]?.url ?? '',
  }))
}

interface ParentMeta {
  parentTitle: string
  depth: number
  chain: Array<{ id: number; title: string; content: string }>
}

/** 批量回溯每条提示词的祖先链，避免详情页逐条查询；chain 为根 → 当前 */
async function buildParentMeta(rows: Prompt[]): Promise<Map<number, ParentMeta>> {
  const cache = new Map<number, Prompt>()
  rows.forEach((row) => cache.set(row.id, row))
  const fetchPrompt = async (id: number): Promise<Prompt | null> => {
    const cached = cache.get(id)
    if (cached) return cached
    const found = await Prompt.findByPk(id)
    if (found) cache.set(id, found)
    return found ?? null
  }

  const result = new Map<number, ParentMeta>()
  for (const row of rows) {
    let depth = 0
    const directParent = row.parentId ? await fetchPrompt(row.parentId) : null
    const parentTitle = directParent?.title ?? ''
    const chain: Array<{ id: number; title: string; content: string }> = []
    let cursor = row
    const seen = new Set<number>([row.id])
    for (let i = 0; cursor.parentId && i < MAX_CHAIN_DEPTH; i += 1) {
      const parent = await fetchPrompt(cursor.parentId)
      if (!parent || seen.has(parent.id)) break
      seen.add(parent.id)
      depth += 1
      chain.unshift({ id: parent.id, title: parent.title, content: parent.content })
      cursor = parent
    }
    chain.push({ id: row.id, title: row.title, content: row.content })
    result.set(row.id, { parentTitle, depth, chain })
  }
  return result
}

export async function decorate(rows: Prompt[]) {
  const relatedCategoryIds = Array.from(
    new Set(rows.flatMap((row) => resolveCategoryIds({ categoryId: row.categoryId, categoryIds: row.categoryIds }))),
  )
  const categories = relatedCategoryIds.length ? await PromptCategory.findAll({ where: { id: { [Op.in]: relatedCategoryIds } } }) : []
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

  const stepRows = promptIds.length
    ? await PromptStep.findAll({
        where: { promptId: { [Op.in]: promptIds } },
        order: [
          ['stepOrder', 'ASC'],
          ['id', 'ASC'],
        ],
      })
    : []
  const stepMap = new Map<number, any[]>()
  for (const step of stepRows) {
    const list = stepMap.get(step.promptId) ?? []
    list.push(step)
    stepMap.set(step.promptId, list)
  }

  const childRows = promptIds.length
    ? await Prompt.findAll({
        where: { parentId: { [Op.in]: promptIds }, isDeleted: 0 },
        attributes: ['id', 'parentId', 'title', 'status'],
        order: [
          ['id', 'ASC'],
        ],
      })
    : []
  const childMap = new Map<number, any[]>()
  for (const child of childRows) {
    const parentKey = Number(child.parentId)
    const list = childMap.get(parentKey) ?? []
    const childImages = imageMap.get(child.id) ?? []
    list.push({
      id: child.id,
      title: child.title,
      status: child.status,
      coverImage: childImages.find((image: any) => image.isCover === 1)?.url ?? childImages[0]?.url ?? '',
    })
    childMap.set(parentKey, list)
  }
  const parentMeta = await buildParentMeta(rows)

  return rows.map((row) => {
    const rowImages = imageMap.get(row.id) ?? []
    const type = row.type || 'single'
    const sequenceSteps = type === 'sequence' ? stepMap.get(row.id) ?? [] : []
    const steps = sequenceSteps.map((step) => {
      const stepImages = rowImages.filter((image: any) => image.stepId === step.id)
      return {
        ...step.toJSON(),
        platformGroups: groupImagesByPlatform(stepImages, platformMap),
        coverImage: stepImages[0]?.url ?? '',
      }
    })
    // 套组封面取第一步的首张图，保证广场卡片展示的是起势画面
    const coverPool = steps.length && steps[0].platformGroups.length ? steps[0].platformGroups[0].images : rowImages
    const categoryIds = resolveCategoryIds({ categoryId: row.categoryId, categoryIds: row.categoryIds })
    return {
      ...row.toJSON(),
      categoryIds,
      categoryNames: categoryIds.map((id) => categoryMap.get(id) ?? ''),
      categoryName: categoryMap.get(row.categoryId) ?? '',
      parentId: row.parentId ?? null,
      parentTitle: parentMeta.get(row.id)?.parentTitle ?? '',
      depth: parentMeta.get(row.id)?.depth ?? 0,
      chain: parentMeta.get(row.id)?.chain ?? [],
      children: childMap.get(row.id) ?? [],
      images: rowImages,
      platformGroups: groupImagesByPlatform(rowImages, platformMap),
      steps,
      coverImage: coverPool.find((image: any) => image.isCover === 1)?.url ?? coverPool[0]?.url ?? '',
    }
  })
}

/** 去重后的模型名，供后台表单下拉选择；手工录入的新模型在保存后会自动进入该列表 */
export async function listModelOptions(): Promise<string[]> {
  const rows = await Prompt.findAll({
    attributes: ['modelName'],
    where: { isDeleted: 0 },
    group: ['modelName'],
    order: [['modelName', 'ASC']],
  })
  return rows.map((row) => String(row.modelName).trim()).filter((name) => name.length > 0)
}

/** 后台关联选择器：搜索可关联的已发布提示词（排除自身，下游由保存时校验拦截） */
export async function listParentOptions(keyword?: string, excludeId?: number, limit = 20) {
  const where: any = { status: 'published', isDeleted: 0 }
  if (keyword) where.title = { [Op.like]: `%${keyword}%` }
  if (excludeId) where.id = { [Op.ne]: excludeId }
  const rows = await Prompt.findAll({
    attributes: ['id', 'title'],
    where,
    order: [
      ['id', 'DESC'],
    ],
    limit,
  })
  return rows.map((row) => ({ id: row.id, title: row.title }))
}

export async function listPrompts(params: PromptQuery) {
  const { page, pageSize, offset } = normalizePage(params)
  const where: any = { isDeleted: 0 }
  if (params.keyword) where.title = { [Op.like]: `%${params.keyword}%` }
  if (params.categoryId !== undefined && params.categoryId !== '') {
    const categoryId = Number(params.categoryId)
    where[Op.or] = [{ categoryId }, { categoryIds: { [Op.contains]: [categoryId] } }]
  }
  if (params.status) where.status = params.status
  if (params.source) where.source = params.source
  if (params.type) where.type = params.type

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

export async function validateInput(data: PromptInput, requireImage: boolean, currentId?: number | null) {
  if (!data.title?.trim()) throw new AppError(400, '标题不能为空')
  if (!data.content?.trim()) throw new AppError(400, '提示词正文不能为空')
  if (!data.modelName?.trim()) throw new AppError(400, '模型名称不能为空')
  const categoryIds = resolveCategoryIds(data)
  if (!categoryIds.length) throw new AppError(400, '请选择分类')
  if (categoryIds.length > MAX_CATEGORIES) throw new AppError(400, `最多选择 ${MAX_CATEGORIES} 个分类`)
  for (const id of categoryIds) await assertCategoryUsable(id)
  data.parentId = await assertParentValid(data.parentId, currentId)
  const defaultPlatformId = await getDefaultPlatformId()

  if (data.type === 'sequence') {
    const steps = data.steps ?? []
    if (steps.length === 0) throw new AppError(400, '套组至少需要 1 个步骤')
    if (steps.length > MAX_STEPS) throw new AppError(400, `套组最多 ${MAX_STEPS} 个步骤`)
    for (const [index, step] of steps.entries()) {
      if (!step.name?.trim()) throw new AppError(400, `第 ${index + 1} 步缺少动作名`)
      if (!step.actionPrompt?.trim()) throw new AppError(400, `第 ${index + 1} 步缺少动作提示词`)
      for (const group of step.platformGroups ?? []) {
        if ((group.images?.length || 0) > IMAGES_PER_STEP_GROUP) {
          throw new AppError(400, `每步每个平台最多上传 ${IMAGES_PER_STEP_GROUP} 张效果图`)
        }
        await assertPlatformUsable(Number(group.platformId) || defaultPlatformId)
      }
    }
    if (requireImage && countInputImages(data) === 0) {
      throw new AppError(400, '正式发布的套组必须上传至少一张效果图')
    }
    return
  }

  const groups = inputGroups(data)
  if (requireImage && countInputImages(data) === 0) {
    throw new AppError(400, '正式发布的提示词必须上传至少一张效果图')
  }
  if (groups.some((group) => (group.images?.length || 0) > IMAGES_PER_GROUP)) {
    throw new AppError(400, `每个平台最多上传 ${IMAGES_PER_GROUP} 张效果图`)
  }
  for (const group of groups) {
    await assertPlatformUsable(Number(group.platformId) || defaultPlatformId)
  }
}

export async function createPrompt(data: PromptInput, authorId: number) {
  const status = data.action === 'publish' ? 'published' : 'draft'
  await validateInput(data, status === 'published')
  const categoryIds = resolveCategoryIds(data)

  const promptId = await sequelize.transaction(async (transaction) => {
    const prompt = await Prompt.create(
      {
        title: data.title!.trim(),
        content: data.content!.trim(),
        categoryId: categoryIds[0],
        categoryIds,
        parentId: data.parentId ? Number(data.parentId) : null,
        modelName: data.modelName!.trim(),
        type: data.type === 'sequence' ? 'sequence' : 'single',
        characterAnchor: data.type === 'sequence' ? data.characterAnchor?.trim() || null : null,
        status,
        source: 'admin',
        authorId,
      },
      { transaction },
    )
    if (data.type === 'sequence') await replaceSteps(prompt.id, data, transaction)
    else if (countInputImages(data) > 0) await replaceImages(prompt.id, data, transaction)
    return prompt.id
  })
  return getPromptById(promptId)
}

export async function updatePrompt(id: number, data: PromptInput) {
  const prompt = await Prompt.findOne({ where: { id, isDeleted: 0 } })
  if (!prompt) throw new AppError(404, '提示词不存在')
  const targetStatus = data.action === 'publish' ? 'published' : prompt.status
  const existingImageCount = await PromptImage.count({ where: { promptId: id } })
  const hasImagePayload = data.platformGroups !== undefined || data.images !== undefined || data.steps !== undefined
  const willHaveImages = hasImagePayload ? countInputImages(data) > 0 : existingImageCount > 0
  if (targetStatus === 'published' && !willHaveImages) throw new AppError(400, '正式发布的提示词必须上传至少一张效果图')
  await validateInput(data, false, id)
  const categoryIds = resolveCategoryIds(data)

  await sequelize.transaction(async (transaction) => {
    await prompt.update(
      {
        title: data.title!.trim(),
        content: data.content!.trim(),
        categoryId: categoryIds[0],
        categoryIds,
        parentId: data.parentId ? Number(data.parentId) : null,
        modelName: data.modelName!.trim(),
        type: data.type === 'sequence' ? 'sequence' : 'single',
        characterAnchor: data.type === 'sequence' ? data.characterAnchor?.trim() || null : null,
        ...(targetStatus !== prompt.status ? { status: targetStatus } : {}),
      },
      { transaction },
    )
    if (data.type === 'sequence') await replaceSteps(id, data, transaction)
    else {
      // 套组改回单条时清理旧步骤记录，避免残留孤儿数据
      await PromptStep.destroy({ where: { promptId: id }, transaction })
      if (data.platformGroups !== undefined || data.images !== undefined) await replaceImages(id, data, transaction)
    }
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

/** 批量软删除：跳过不存在或已删除的条目，返回实际删除数 */
export async function deletePrompts(ids: number[]) {
  const uniqueIds = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
  if (!uniqueIds.length) throw new AppError(400, '请提供要删除的提示词 ID')
  const [affected] = await Prompt.update({ isDeleted: 1, status: 'offline' }, { where: { id: { [Op.in]: uniqueIds }, isDeleted: 0 } })
  return { deleted: affected }
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
