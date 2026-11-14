import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import * as auditLogService from '../services/auditLogService.js'
import * as spuService from '../services/spuService.js'
import { verifyWorkflowCallback } from '../../../services/workflowCallbackAuth.js'

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await spuService.listSpus(req.query as never)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const detail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await spuService.getSpuDetail(Number(req.params.id))
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await spuService.createSpu(req.body)
    res.json({ code: 0, data })
    await auditLogService.recordAdminAction(req, 'spu.created', 'config', Number(req.params.id) || null)
  } catch (err) {
    next(err)
  }
}

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await spuService.updateSpu(Number(req.params.id), req.body)
    res.json({ code: 0, data })
    await auditLogService.recordAdminAction(req, 'spu.updated', 'config', Number(req.params.id) || null)
  } catch (err) {
    next(err)
  }
}

/** 状态机流转（submit/reject/list/publish/unlist/archive） */
export const changeStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, reason } = req.body as { action: string; reason?: string }
    const data = await spuService.changeSpuStatus(Number(req.params.id), action as never, reason)
    res.json({ code: 0, data })
    await auditLogService.recordAdminAction(req, 'spu.status_changed', 'config', Number(req.params.id) || null)
  } catch (err) {
    next(err)
  }
}

/** 提交发布：接入审批流（合规卡点 + 工作流） */
export const submitForPublish = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { channelId, shopId, listToChannel, requiredQualifications } = req.body as {
      channelId?: number
      shopId?: number
      listToChannel?: boolean
      requiredQualifications?: string[]
    }
    const data = await spuService.submitForPublish(Number(req.params.id), { channelId, shopId, listToChannel, requiredQualifications })
    res.json({ code: 0, data })
    await auditLogService.recordAdminAction(req, 'spu.submitted', 'config', Number(req.params.id) || null)
  } catch (err) {
    next(err)
  }
}

/** 工作流审批结果回调（由引擎 fireWorkflowCallback POST 触发，HMAC 验签 fail-closed） */
export const workflowCallback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = (req.body ?? {}) as { instanceId?: number; status?: string }
    const signature = req.headers['x-workflow-signature'] as string | undefined
    const ts = req.headers['x-workflow-ts'] as string | undefined
    // fail-closed：缺签名 / 签名不符 / 时间戳过期 一律拒绝，杜绝匿名伪造审批回调
    if (!verifyWorkflowCallback(body.instanceId, body.status, signature, ts)) {
      next(new AppError(401, '回调签名校验失败'))
      return
    }
    const { instanceId, status } = body
    if (status !== 'approved' && status !== 'rejected') {
      res.json({ code: 0, data: null })
      return
    }
    const spu = await spuService.applyWorkflowResult(Number(instanceId), status as 'approved' | 'rejected')
    res.json({ code: 0, data: { id: spu.id, status: spu.status } })
  } catch (err) {
    next(err)
  }
}

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await spuService.deleteSpu(Number(req.params.id))
    res.json({ code: 0, data: null })
    await auditLogService.recordAdminAction(req, 'spu.deleted', 'config', Number(req.params.id) || null)
  } catch (err) {
    next(err)
  }
}
