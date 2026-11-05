import type { NextFunction, Request, Response } from 'express'
import * as auditLogService from '../services/auditLogService.js'

/**
 * X-T03 审计查询端点（只读，仅 admin）
 * 挂载于 GET /api/v1/shop/audit-logs?entityType=order&entityId=58
 */
export const listAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const entityType = String(req.query.entityType ?? '')
    if (!entityType) {
      res.status(400).json({ code: 400, message: 'entityType 必填（order|payment|inventory|refund）' })
      return
    }
    const entityId = req.query.entityId != null && req.query.entityId !== '' ? Number(req.query.entityId) : undefined
    const rows = await auditLogService.listByEntity({ entityType, entityId })
    res.json({ code: 0, data: rows })
  } catch (err) {
    next(err)
  }
}
