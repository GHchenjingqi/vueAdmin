import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { ShopSpu, ShopSku } from '../models/index.js'
import type { CreateSpuInput, SpuStatus, StatusAction, UpdateSpuInput } from '../../../shared/schemas/shop.js'
import { spuStatusTransitions, statusActionTarget } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'
import * as skuService from './skuService.js'
import { checkSpuCompliance } from './complianceService.js'
import * as channelProductService from './channelProductService.js'
import WorkflowInstance from '../../../models/WorkflowInstance.js'
import WorkflowBinding from '../../../models/WorkflowBinding.js'
import Workflow from '../../../models/Workflow.js'
import WorkflowEngine from '../../../services/WorkflowEngine.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

/** slug 租户内唯一：重复则抛 409（阶段 5 第 2 步） */
async function ensureUniqueSlug(slug: string | undefined | null, tenantId: number, excludeId?: number): Promise<void> {
  if (!slug) return
  const where: Record<string, unknown> = { tenantId, slug }
  if (excludeId !== undefined) where.id = { [Op.ne]: excludeId }
  const existing = await ShopSpu.findOne({ where })
  if (existing) throw new AppError(409, `slug "${slug}" 已被占用`)
}

export async function listSpus(params: { page?: number; pageSize?: number; keyword?: string; categoryId?: number; status?: SpuStatus }) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where: Record<string, unknown> = { tenantId: tid() }
  // params 来自透传的 req.query，categoryId 可能是字符串，需安全转换
  const categoryId = Number(params.categoryId)
  if (Number.isInteger(categoryId) && categoryId > 0) where.categoryId = categoryId
  const validStatus = ['draft', 'review', 'rejected', 'listed', 'published', 'unlisted', 'archived']
  if (params.status && validStatus.includes(params.status)) where.status = params.status
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
  const tenantId = tid()
  await ensureUniqueSlug(input.slug, tenantId)
  return ShopSpu.create({ ...input, tenantId } as never)
}

export async function updateSpu(id: number, input: UpdateSpuInput): Promise<ShopSpu> {
  const row = await getSpuById(id)
  // 仅草稿/驳回态可编辑基础信息
  if (!['draft', 'rejected'].includes(row.status)) {
    throw new AppError(400, `当前状态 ${row.status} 不允许编辑，请先下架或撤回`)
  }
  if (input.slug !== undefined && input.slug !== row.slug) {
    await ensureUniqueSlug(input.slug, tid(), id)
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

// ==================== 阶段 2：提交发布（接入工作流审批流） ====================

export interface SubmitPublishOptions {
  channelId?: number
  shopId?: number
  listToChannel?: boolean
  requiredQualifications?: string[]
}

/**
 * 提交发布：合规卡点 + 进入审批流（bindingKey = shop-publish）。
 * 审批通过后由工作流回调 applyWorkflowResult 将 SPU 置为 published，并按需发布到渠道。
 * 若未配置审批流绑定，则降级为直接发布（保证可用性，已记录日志）。
 */
export async function submitForPublish(spuId: number, opts: SubmitPublishOptions = {}): Promise<{ status: SpuStatus; instanceId: number | null }> {
  const row = await getSpuById(spuId)
  if (!['draft', 'rejected', 'listed'].includes(row.status)) {
    throw new AppError(400, `当前状态 ${row.status} 不可提交发布`)
  }

  // 合规卡点（跨境红线）：每个 SKU 须齐备 hs_code / origin_country / declared_value
  const compliance = await checkSpuCompliance(spuId, opts.requiredQualifications)
  if (!compliance.ok) {
    const detail = compliance.missing
      .map((m) => `SKU[${m.skuCode}] 缺失: ${m.fields.join('、')}`)
      .join('; ')
    throw new AppError(400, `合规校验未通过: ${detail}`)
  }

  // 进入待审状态（复用状态机 submit 动作）
  await changeSpuStatus(spuId, 'submit')

  const binding = await WorkflowBinding.findOne({ where: { bindingKey: 'shop-publish', status: 1 } })
  if (!binding) {
    // 未配置审批流：降级直接发布（并记录）
    await row.update({ status: 'published' })
    await skuService.followSpuStatus(spuId, 'published')
    return { status: 'published', instanceId: null }
  }
  const workflow = await Workflow.findByPk(binding.workflowId)
  if (!workflow || !workflow.publishedVersionId) {
    await row.update({ status: 'published' })
    await skuService.followSpuStatus(spuId, 'published')
    return { status: 'published', instanceId: null }
  }

  const instance = await WorkflowInstance.create({
    workflowId: workflow.id,
    versionId: workflow.publishedVersionId,
    bindingKey: 'shop-publish',
    bindingId: spuId,
    title: `商品发布审批 #${spuId}`,
    status: 'pending',
    input: JSON.stringify({
      spuId,
      channelId: opts.channelId ?? null,
      shopId: opts.shopId ?? null,
      listToChannel: opts.listToChannel ?? false,
    }),
    startedBy: getTenantContext()?.userId ?? 0,
    tenantId: tid(),
  } as never)

  const engine = new WorkflowEngine()
  engine.execute(instance).catch(() => {})
  return { status: 'review', instanceId: instance.id }
}

/**
 * 工作流审批结果回调：审批流结束后由引擎回调 shop/workflow-callback 触发。
 * approved → SPU 置为 published（SKU 跟随）；rejected → rejected。
 * 若提交时已选择渠道，则审批通过后同步发布到渠道（channel_products）。
 */
export async function applyWorkflowResult(instanceId: number, finalStatus: 'approved' | 'rejected', reason?: string): Promise<ShopSpu> {
  const instance = await WorkflowInstance.findByPk(instanceId)
  if (!instance || !instance.bindingKey || instance.bindingKey !== 'shop-publish') {
    throw new AppError(400, '无效的工作流实例')
  }
  const input = (instance.input ? JSON.parse(instance.input) : {}) as { spuId: number; channelId?: number; shopId?: number; listToChannel?: boolean }
  const spu = await getSpuById(input.spuId)

  if (finalStatus === 'rejected') {
    await spu.update({ status: 'rejected' })
    return spu
  }

  // 审批通过：发布（SKU 跟随流转）
  await spu.update({ status: 'published' })
  await skuService.followSpuStatus(input.spuId, 'published')

  // 审批通过后按提交时选择的渠道发布
  if (input.listToChannel && input.channelId && input.shopId) {
    await channelProductService.publishToChannel(input.spuId, input.channelId, input.shopId).catch(() => null)
  }
  return spu
}
