/**
 * X-T03 审计日志服务
 *
 * 记录订单/支付/库存/退款状态变更；币种配置变更在 `config_changes`（P5-T02），
 * 由该表独立记录，本服务不重复记录 config 实体。
 *
 * 设计要点：
 * - record() 对调用方副作用最小化：审计写入失败仅告警（console.warn），不阻断业务主流程；
 * - 支持传入事务（tx），与业务操作原子提交；也可独立写入（不传 tx）；
 * - 缺少 tenantId 时回退平台租户 1（与全局租户上下文一致）。
 */
import type { Request } from 'express'
import type { Transaction } from 'sequelize'
import { Op } from 'sequelize'
import AuditLog from '../models/AuditLog.js'
import { exportExcel } from '../../../utils/exportExcel.js'
import { getTenantContext } from '../../tenant/context.js'

export type AuditActorType = 'admin' | 'customer' | 'system'
export type AuditEntityType = 'order' | 'payment' | 'inventory' | 'refund' | 'config' | 'article'

export interface AuditRecordInput {
  tenantId?: number
  actorType?: AuditActorType
  actorId?: number | null
  action: string
  entityType: AuditEntityType
  entityId?: number | null
  beforeState?: unknown
  afterState?: unknown
}

export interface AuditQuery {
  entityType: AuditEntityType | string
  entityId?: number
  tenantId?: number
  limit?: number
  /** 分页偏移（默认 0），与 limit 配合做审计回溯分页 */
  offset?: number
  /** 精确匹配动作名，如 order.payment_captured / article.published */
  action?: string
  /** 按操作人 ID 过滤（admin 操作取 req.user.id） */
  actorId?: number
  /** 按操作者类型过滤：admin / customer / system */
  actorType?: string
  /** createdAt 下界（含） */
  from?: Date
  /** createdAt 上界（含） */
  to?: Date
}

/** 写入一条审计记录；失败仅告警，绝不影响业务主流程 */
export async function record(input: AuditRecordInput, tx?: Transaction): Promise<void> {
  const tenantId = input.tenantId ?? getTenantContext()?.tenantId ?? 1
  try {
    await AuditLog.create(
      {
        tenantId,
        actorType: input.actorType ?? 'system',
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        beforeState: input.beforeState ?? null,
        afterState: input.afterState ?? null,
      } as never,
      tx ? { transaction: tx } : undefined,
    )
  } catch (err) {
    console.warn(`[audit] 写入失败（不阻断业务）: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * 后台高敏操作留痕的统一入口：从 req.user 取操作人、从租户上下文取 tenantId。
 * 调用方只传非敏感的 afterState（ID / 字段名 / 状态字面量），绝不传请求体原文。
 */
export async function recordAdminAction(
  req: Request,
  action: string,
  entityType: AuditEntityType,
  entityId: number | null,
  afterState?: unknown,
): Promise<void> {
  const user = (req as unknown as { user?: { id?: number } }).user
  await record({
    actorType: 'admin',
    actorId: user?.id ?? null,
    action,
    entityType,
    entityId,
    afterState,
  })
}

/** 按实体回溯状态变更链（倒序，最新在前）；支持 action / 时间范围 / 分页过滤 */
export async function listByEntity(q: AuditQuery): Promise<AuditLog[]> {
  const where: Record<string | symbol, unknown> = {
    tenantId: q.tenantId ?? getTenantContext()?.tenantId ?? 1,
    entityType: q.entityType,
    ...(q.entityId != null ? { entityId: q.entityId } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.actorId != null ? { actorId: q.actorId } : {}),
    ...(q.actorType ? { actorType: q.actorType } : {}),
  }
  if (q.from || q.to) {
    const range: Record<symbol, Date> = {}
    if (q.from) range[Op.gte] = q.from
    if (q.to) range[Op.lte] = q.to
    where.createdAt = range
  }
  return AuditLog.findAll({
    where,
    order: [['id', 'DESC']],
    limit: Math.min(Math.max(q.limit ?? 100, 1), 500),
    offset: Math.max(q.offset ?? 0, 0),
  })
}

/** P2-8：审计日志导出为 Excel（与 listByEntity 同过滤口径，最多 5000 行） */
export async function exportAuditLogs(q: AuditQuery) {
  const where: Record<string | symbol, unknown> = {
    tenantId: q.tenantId ?? getTenantContext()?.tenantId ?? 1,
    entityType: q.entityType,
    ...(q.entityId != null ? { entityId: q.entityId } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.actorId != null ? { actorId: q.actorId } : {}),
    ...(q.actorType ? { actorType: q.actorType } : {}),
  }
  if (q.from || q.to) {
    const range: Record<symbol, Date> = {}
    if (q.from) range[Op.gte] = q.from
    if (q.to) range[Op.lte] = q.to
    where.createdAt = range
  }
  const rows = await AuditLog.findAll({ where, order: [['id', 'DESC']], limit: 5000 })
  const fmt = (v: unknown): string => {
    if (v == null) return ''
    if (typeof v === 'string') return v
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  const data = rows.map((r) => ({
    createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId ?? '',
    actor: `${r.actorType}${r.actorId != null ? ' #' + r.actorId : ''}`,
    afterState: fmt(r.afterState),
  }))
  const columns = [
    { prop: 'createdAt', label: '时间', width: 22 },
    { prop: 'action', label: '动作', width: 30 },
    { prop: 'entityType', label: '实体类型', width: 14 },
    { prop: 'entityId', label: '实体ID', width: 12 },
    { prop: 'actor', label: '操作人', width: 16 },
    { prop: 'afterState', label: '变更后状态', width: 60 },
  ]
  const { buffer, filename } = await exportExcel({ columns, data, filename: '审计日志.xlsx', sheetName: '审计日志' })
  return { buffer, filename }
}
