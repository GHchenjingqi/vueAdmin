import type { NextFunction, Request, Response } from 'express'
import { queryInt, queryStr } from '../utils/query.js'
import * as auditLogService from '../services/auditLogService.js'

/** 未传返回 undefined；非法日期返回 null，以便与「未传」区分后给 400 */
function parseDate(raw: string | undefined): Date | null | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * X-T03 审计查询端点（只读，仅 admin）
 * GET /api/v1/shop/audit-logs?entityType=order&entityId=58&action=&from=&to=&limit=&offset=
 */
export const listAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const entityType = queryStr(req.query.entityType)
    if (!entityType) {
      res.status(400).json({ code: 400, message: 'entityType 必填（order|payment|inventory|refund|config|article）' })
      return
    }
    const from = parseDate(queryStr(req.query.from))
    const to = parseDate(queryStr(req.query.to))
    if (from === null || to === null) {
      res.status(400).json({ code: 400, message: 'from/to 必须为合法日期' })
      return
    }
    const rows = await auditLogService.listByEntity({
      entityType,
      entityId: queryInt(req.query.entityId),
      action: queryStr(req.query.action),
      actorId: queryInt(req.query.actorId),
      actorType: queryStr(req.query.actorType),
      limit: queryInt(req.query.limit),
      offset: queryInt(req.query.offset),
      from: from ?? undefined,
      to: to ?? undefined,
    })
    res.json({ code: 0, data: rows })
  } catch (err) {
    next(err)
  }
}

/**
 * P2-8 审计日志导出端点（admin，与 list 同过滤口径）
 * GET /api/v1/shop/audit-logs/export?entityType=order&...
 */
export const exportAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const entityType = queryStr(req.query.entityType)
    if (!entityType) {
      res.status(400).json({ code: 400, message: 'entityType 必填' })
      return
    }
    const from = parseDate(queryStr(req.query.from))
    const to = parseDate(queryStr(req.query.to))
    if (from === null || to === null) {
      res.status(400).json({ code: 400, message: 'from/to 必须为合法日期' })
      return
    }
    const { buffer, filename } = await auditLogService.exportAuditLogs({
      entityType,
      entityId: queryInt(req.query.entityId),
      action: queryStr(req.query.action),
      actorId: queryInt(req.query.actorId),
      actorType: queryStr(req.query.actorType),
      from: from ?? undefined,
      to: to ?? undefined,
    })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    res.send(buffer)
  } catch (err) {
    next(err)
  }
}
