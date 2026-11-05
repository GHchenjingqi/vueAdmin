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
import type { Transaction } from 'sequelize'
import AuditLog from '../models/AuditLog.js'
import { getTenantContext } from '../../tenant/context.js'

export type AuditActorType = 'admin' | 'customer' | 'system'
export type AuditEntityType = 'order' | 'payment' | 'inventory' | 'refund' | 'config'

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

/** 按实体回溯状态变更链（倒序，最新在前） */
export async function listByEntity(q: AuditQuery): Promise<AuditLog[]> {
  return AuditLog.findAll({
    where: {
      tenantId: q.tenantId ?? getTenantContext()?.tenantId ?? 1,
      entityType: q.entityType,
      ...(q.entityId != null ? { entityId: q.entityId } : {}),
    },
    order: [['id', 'DESC']],
    limit: q.limit ?? 100,
  })
}
