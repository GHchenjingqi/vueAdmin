import { Op } from 'sequelize'
import sequelize from '../../../config/database.js'
import PromptPlatform from '../models/PromptPlatform.js'
import PromptImage from '../models/PromptImage.js'
import { AppError } from '../../../middleware/errorHandler.js'

export interface PlatformQuery {
  page?: number
  pageSize?: number
  keyword?: string
  status?: number | string
}

export interface PlatformInput {
  name?: string
  sort?: number
  status?: number
}

function normalizePage(params: PlatformQuery) {
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export async function listPlatforms(params: PlatformQuery) {
  const { page, pageSize, offset } = normalizePage(params)
  const where: any = {}
  if (params.keyword) where.name = { [Op.like]: `%${params.keyword}%` }
  if (params.status !== undefined && params.status !== '') where.status = Number(params.status)

  const { rows, count } = await PromptPlatform.findAndCountAll({
    where,
    order: [
      ['sort', 'ASC'],
      ['id', 'ASC'],
    ],
    offset,
    limit: pageSize,
  })
  const counters = (await sequelize.query(
    'SELECT pi.platformId, COUNT(DISTINCT pi.promptId) AS promptCount, COUNT(pi.id) AS imageCount FROM prompt_images pi INNER JOIN prompts p ON p.id = pi.promptId AND p.isDeleted = 0 GROUP BY pi.platformId',
    { raw: true },
  )) as any[]
  const countMap = new Map<number, { promptCount: number; imageCount: number }>()
  for (const item of counters) {
    countMap.set(Number(item.platformId), { promptCount: Number(item.promptCount) || 0, imageCount: Number(item.imageCount) || 0 })
  }

  return {
    rows: rows.map((row) => ({
      ...row.toJSON(),
      ...(countMap.get(row.id) ?? { promptCount: 0, imageCount: 0 }),
    })),
    total: count,
    page,
    pageSize,
  }
}

export async function listPlatformOptions() {
  return PromptPlatform.findAll({
    where: { status: 1 },
    order: [
      ['sort', 'ASC'],
      ['id', 'ASC'],
    ],
  })
}

export async function createPlatform(data: PlatformInput) {
  const name = data.name?.trim()
  if (!name) throw new AppError(400, '平台名称不能为空')
  if (await PromptPlatform.findOne({ where: { name } })) throw new AppError(400, '平台名称已存在')
  const maxSort = (await PromptPlatform.max('sort')) as number | null
  return PromptPlatform.create({
    name,
    sort: data.sort ?? (maxSort ?? 0) + 1,
    status: data.status ?? 1,
    builtin: 0,
  })
}

export async function updatePlatform(id: number, data: PlatformInput) {
  const platform = await PromptPlatform.findByPk(id)
  if (!platform) throw new AppError(404, '平台不存在')
  if (data.name !== undefined) {
    const name = data.name.trim()
    if (!name) throw new AppError(400, '平台名称不能为空')
    if (await PromptPlatform.findOne({ where: { name, id: { [Op.ne]: id } } })) throw new AppError(400, '平台名称已存在')
    platform.name = name
  }
  if (data.sort !== undefined) platform.sort = Number(data.sort)
  if (data.status !== undefined) {
    if (platform.builtin === 1 && Number(data.status) !== 1) throw new AppError(400, '默认平台不能停用')
    platform.status = Number(data.status)
  }
  await platform.save()
  return platform
}

export async function deletePlatform(id: number) {
  const platform = await PromptPlatform.findByPk(id)
  if (!platform) throw new AppError(404, '平台不存在')
  if (platform.builtin === 1) throw new AppError(400, '默认平台不能删除')
  const used = await PromptImage.count({ where: { platformId: id } })
  if (used > 0) throw new AppError(409, `该平台下还有 ${used} 张效果图，请先迁移或删除后再删除`)
  await platform.destroy()
}

/** 校验平台可用于发布：必须存在且启用 */
export async function assertPlatformUsable(platformId: number) {
  const platform = await PromptPlatform.findByPk(platformId)
  if (!platform) throw new AppError(400, '平台不存在')
  if (platform.status !== 1) throw new AppError(400, '平台已停用，请选择其他平台')
  return platform
}

export async function getDefaultPlatformId() {
  const platform = await PromptPlatform.findOne({ where: { name: '通用' } })
  return platform?.id ?? 1
}
