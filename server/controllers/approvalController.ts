/**
 * 审批任务控制器
 *
 * 职责：仅做 HTTP 请求/响应编排，审批推进委托给 WorkflowEngine
 */
import { Op } from 'sequelize'
import ApprovalTask from '../models/ApprovalTask.js'
import WorkflowInstance from '../models/WorkflowInstance.js'
import WorkflowEngine from '../services/WorkflowEngine.js'
import { AppError } from '../middleware/errorHandler.js'
import { sendToUser } from '../utils/sseManager.js'
import { logOperation } from '../utils/logger.js'

/** 我的待办/已办审批列表 */
export const listMyTasks = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, status } = req.query
    const where = { approverId: req.user.id }
    if (status) where.status = status

    const { rows, count } = await ApprovalTask.findAndCountAll({
      where,
      offset: (Number(page) - 1) * Number(pageSize),
      limit: Number(pageSize),
      order: [['createdAt', 'DESC']],
    })

    res.json({ code: 0, data: { rows, total: count, page: Number(page), pageSize: Number(pageSize) } })
  } catch (err) {
    next(err)
  }
}

/** 审批（通过/驳回） */
export const approve = async (req, res, next) => {
  try {
    const task = await ApprovalTask.findByPk(Number(req.params.id))
    if (!task) throw new AppError(404, '审批任务不存在')
    if (task.status !== 'pending') throw new AppError(400, '审批任务已处理')
    if (task.approverId !== req.user.id) throw new AppError(403, '无权处理此审批')

    const { status, comment } = req.body
    await task.update({
      status,
      comment: comment || null,
      approverName: req.user.nickname || req.user.username,
      finishedAt: new Date(),
    })

    const instance = await WorkflowInstance.findByPk(task.instanceId)
    if (instance) {
      if (status === 'rejected') {
        await instance.update({ status: 'rejected', currentNodeKey: null, finishedAt: new Date() })
      } else {
        const engine = new WorkflowEngine()
        engine.execute(instance).catch(() => {})
      }
      if (instance.startedBy) {
        sendToUser(instance.startedBy, 'approval-result', {
          taskId: task.id,
          instanceId: instance.id,
          status: task.status,
          comment: task.comment,
          message: `您的审批已${status === 'approved' ? '通过' : '驳回'}`,
        })
      }
    }

    logOperation(req, status === 'approved' ? '审批通过' : '审批驳回', `任务ID: ${task.id}, 意见: ${comment || '无'}`)
    res.json({ code: 0, message: status === 'approved' ? '已通过' : '已驳回' })
  } catch (err) {
    next(err)
  }
}