import type { Request, Response, NextFunction } from 'express'
import * as auditLogService from '../services/auditLogService.js'
import * as spuService from '../services/spuService.js'

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

/** 工作流审批结果回调（由引擎 fireWorkflowCallback POST 触发，内部接口免鉴权） */
export const workflowCallback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { instanceId, status } = req.body as { instanceId: number; status: string }
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
