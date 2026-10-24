/**
 * 审批任务控制器
 *
 * 职责：仅做 HTTP 请求/响应编排，审批推进委托给 WorkflowEngine
 */
import { Op } from 'sequelize'
import ApprovalTask from '../models/ApprovalTask.js'
import WorkflowInstance from '../models/WorkflowInstance.js'
import Workflow from '../models/Workflow.js'
import User from '../models/User.js'
import WorkflowEngine from '../services/WorkflowEngine.js'
import { AppError } from '../middleware/errorHandler.js'
import { sendToUser } from '../utils/sseManager.js'
import { logOperation } from '../utils/logger.js'
import { createCache, stableKey } from '../utils/cache.js'
import { applyCurrentTenantScope } from '../modules/tenant/scope.js'

// 我的审批列表缓存：键含 userId + 租户约束 + 状态 + 分页，TTL 短以保证待办变化可见
const approvalTaskListCache = createCache<{ rows: any[]; total: number; page: number; pageSize: number }>({
  namespace: 'approval-tasks',
  max: 300,
  maxAgeMs: 30 * 1000,
})

/** 我的待办/已办审批列表 */
export const listMyTasks = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, status } = req.query
    const where: any = { approverId: req.user.id }
    // 已办：传入逗号分隔的多个状态（如 approved,rejected）
    if (status) {
      const statusList = String(status).split(',').filter(Boolean)
      where.status = statusList.length > 1 ? { [Op.in]: statusList } : status
    }
    // 租户约束（approverId 归属之外的第二道闸）：必须在缓存键生成前注入
    applyCurrentTenantScope(where)

    const cacheKey = stableKey({ userId: req.user.id, where, page: Number(page), pageSize: Number(pageSize) })
    const result = await approvalTaskListCache.getOrSet(cacheKey, async () => {
      const { rows, count } = await ApprovalTask.findAndCountAll({
        where,
        offset: (Number(page) - 1) * Number(pageSize),
        limit: Number(pageSize),
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: WorkflowInstance,
            as: 'instance',
            attributes: ['id', 'title', 'status', 'currentNodeKey', 'startedBy', 'startedAt'],
            include: [
              { model: Workflow, as: 'workflow', attributes: ['id', 'name'] },
              { model: User, as: 'starter', attributes: ['id', 'username', 'nickname'] },
            ],
          },
        ],
      })
      return { rows, total: count, page: Number(page), pageSize: Number(pageSize) }
    })

    res.json({ code: 0, data: result })
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
      // 审批通过/驳回后从被审批节点向下游续跑（不再整图重跑）
      const engine = new WorkflowEngine()
      await engine.resumeAfterApproval(instance, task.nodeKey, task.approverId, status)
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
