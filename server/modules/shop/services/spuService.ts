import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { ShopSpu, ShopSku } from '../models/index.js'
import type { CreateSpuInput, SpuStatus, StatusAction, UpdateSpuInput } from '../../../shared/schemas/shop.js'
import { spuStatusTransitions, statusActionTarget } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'
import * as skuService from './skuService.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

export async function listSpus(params: { page?: number; pageSize?: number; keyword?: string; categoryId?: number; status?: SpuStatus }) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where: Record<string, unknown> = { tenantId: tid() }
  if (params.categoryId) where.categoryId = params.categoryId
  if (params.status) where.status = params.status
  // 多语言标题关键字：JSON 列序列化后 like
  if (params.keyword) where.name = { [Op.like]: `%${params.keyword}%` }
  const { rows, count } = await ShopSpu.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

export async function getSpuById(id: number): Promise<ShopSpu> {
  const row = await ShopSpu.findOne({ where: { id, tenantId: tid() } })
  if (!row) throw new AppError(404, '商品不存在')
  return row
}

/** SPU 详情（含 SKU 与状态机可执行动作） */
export async function getSpuDetail(id: number) {
  const spu = await getSpuById(id)
  const skus = await ShopSku.findAll({ where: { spuId: id, tenantId: tid() }, order: [['id', 'ASC']] })
  const allowedActions = spuStatusTransitions[spu.status]
  return { spu, skus, allowedActions }
}

export async function createSpu(input: CreateSpuInput): Promise<ShopSpu> {
  return ShopSpu.create({ ...input, tenantId: getTenantContext()?.tenantId ?? 1 } as never)
}

export async function updateSpu(id: number, input: UpdateSpuInput): Promise<ShopSpu> {
  const row = await getSpuById(id)
  // 仅草稿/驳回态可编辑基础信息
  if (!['draft', 'rejected'].includes(row.status)) {
    throw new AppError(400, `当前状态 ${row.status} 不允许编辑，请先下架或撤回`)
  }
  await row.update(input as never)
  return row
}

/**
 * 状态机流转（阶段 1 直接流转；阶段 2 提交/通过改为审批流驱动）
 * SKU 状态跟随 SPU：list/publish 时 SKU 一并流转（需先过合规卡点）
 */
export async function changeSpuStatus(id: number, action: StatusAction, reason?: string): Promise<ShopSpu> {
  const row = await getSpuById(id)
  const target = statusActionTarget[action]
  const allowed = spuStatusTransitions[row.status] as SpuStatus[]
  if (!allowed.includes(target)) {
    throw new AppError(400, `不允许从 ${row.status} 流转到 ${target}`)
  }
  if (action === 'reject' && !reason) {
    throw new AppError(400, '驳回必须填写原因')
  }
  // 上架/发布前合规卡点：每个 SKU 必须有 originCountry + hsCode（跨境红线）
  if (['listed', 'published'].includes(target)) {
    const skus = await ShopSku.findAll({ where: { spuId: id, tenantId: tid() } })
    if (skus.length === 0) throw new AppError(400, 'SPU 下没有 SKU，无法上架/发布')
    const missing = skus.filter((s) => !s.originCountry || !s.hsCode)
    if (missing.length > 0) {
      throw new AppError(400, `以下 SKU 缺少原产国或 HS 编码，无法上架/发布：${missing.map((s) => s.code).join(', ')}`)
    }
  }
  await row.update({ status: target })
  // SKU 跟随流转（发布/上架/下架/归档）
  await skuService.followSpuStatus(id, target)
  return row
}

export async function deleteSpu(id: number): Promise<void> {
  const row = await getSpuById(id)
  if (row.status !== 'draft' && row.status !== 'archived') {
    throw new AppError(400, '仅草稿或已归档商品可删除')
  }
  await ShopSku.destroy({ where: { spuId: id, tenantId: tid() } })
  await row.destroy()
}
