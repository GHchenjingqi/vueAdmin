/**
 * 流程实例与触发控制器
 *
 * 职责：仅做 HTTP 请求/响应编排，实例执行委托给 WorkflowEngine
 */
import WorkflowInstance from '../models/WorkflowInstance.js'
import WorkflowInstanceLog from '../models/WorkflowInstanceLog.js'
import ApprovalTask from '../models/ApprovalTask.js'
import Workflow from '../models/Workflow.js'
import WorkflowBinding from '../models/WorkflowBinding.js'
import User from '../models/User.js'
import WorkflowEngine from '../services/WorkflowEngine.js'
import { AppError } from '../middleware/errorHandler.js'
import { logOperation } from '../utils/logger.js'

/** 通过业务绑定触发流程 */
export const trigger = async (req, res, next) => {
  try {
    const { bindingKey, bindingId, input, title } = req.body

    const binding = await WorkflowBinding.findOne({ where: { bindingKey, status: 1 } })
    if (!binding) throw new AppError(404, '流程绑定不存在或已禁用')

    const workflow = await Workflow.findByPk(binding.workflowId)
    if (!workflow || workflow.status === 0) throw new AppError(400, '流程未启用')
    if (!workflow.publishedVersionId) throw new AppError(400, '流程尚未发布')

    const instance = await WorkflowInstance.create({
      workflowId: workflow.id,
      versionId: workflow.publishedVersionId,
      bindingKey,
      bindingId,
      title: title || `${workflow.name} #${bindingId}`,
      status: 'pending',
      input: input ? JSON.stringify(input) : null,
      startedBy: req.user?.id,
    })

    const engine = new WorkflowEngine()
    engine.execute(instance).catch(() => {})

    logOperation(req, '触发流程', `实例ID: ${instance.id}, 流程: ${workflow.name}`)
    res.status(201).json({ code: 0, data: { id: instance.id }, message: '流程已触发' })
  } catch (err) {
    next(err)
  }
}

/** 实例列表（分页） */
export const listInstances = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, status, bindingKey, bindingId } = req.query
    const where = {}
    if (status) where.status = status
    if (bindingKey) where.bindingKey = bindingKey
    if (bindingId) where.bindingId = Number(bindingId)

    const { rows, count } = await WorkflowInstance.findAndCountAll({
      where,
      offset: (Number(page) - 1) * Number(pageSize),
      limit: Number(pageSize),
      order: [['createdAt', 'DESC']],
      include: [
        { model: Workflow, as: 'workflow', attributes: ['id', 'name'] },
        { model: User, as: 'starter', attributes: ['id', 'username', 'nickname'] },
      ],
    })

    res.json({ code: 0, data: { rows, total: count, page: Number(page), pageSize: Number(pageSize) } })
  } catch (err) {
    next(err)
  }
}

/** 实例详情（含节点日志与审批记录） */
export const getInstanceDetail = async (req, res, next) => {
  try {
    const instance = await WorkflowInstance.findByPk(Number(req.params.id), {
      include: [
        { model: Workflow, as: 'workflow', attributes: ['id', 'name'] },
        { model: User, as: 'starter', attributes: ['id', 'username', 'nickname'] },
      ],
    })
    if (!instance) throw new AppError(404, '实例不存在')

    const [logs, approvals] = await Promise.all([
      WorkflowInstanceLog.findAll({ where: { instanceId: instance.id }, order: [['id', 'ASC']] }),
      ApprovalTask.findAll({ where: { instanceId: instance.id }, order: [['id', 'ASC']] }),
    ])

    res.json({ code: 0, data: { instance, logs, approvals } })
  } catch (err) {
    next(err)
  }
}

/** 重试失败/终止的实例 */
export const retryInstance = async (req, res, next) => {
  try {
    const instance = await WorkflowInstance.findByPk(Number(req.params.id))
    if (!instance) throw new AppError(404, '实例不存在')
    if (instance.status !== 'failed' && instance.status !== 'terminated') {
      throw new AppError(400, '仅失败或终止的实例可以重试')
    }

    await instance.update({ status: 'pending', currentNodeKey: null, output: null })

    const engine = new WorkflowEngine()
    engine.execute(instance).catch(() => {})

    res.json({ code: 0, message: '重试已触发' })
  } catch (err) {
    next(err)
  }
}

/** 终止实例 */
export const terminateInstance = async (req, res, next) => {
  try {
    const instance = await WorkflowInstance.findByPk(Number(req.params.id))
    if (!instance) throw new AppError(404, '实例不存在')
    if (['approved', 'rejected', 'terminated'].includes(instance.status)) {
      throw new AppError(400, '实例已结束，无法终止')
    }

    await instance.update({ status: 'terminated', finishedAt: new Date() })
    await ApprovalTask.update({ status: 'canceled' }, { where: { instanceId: instance.id, status: 'pending' } })

    logOperation(req, '终止流程实例', `实例ID: ${instance.id}`)
    res.json({ code: 0, message: '已终止' })
  } catch (err) {
    next(err)
  }
}