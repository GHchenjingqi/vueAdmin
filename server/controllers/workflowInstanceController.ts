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
import { createCache, stableKey } from '../utils/cache.js'
import { applyCurrentTenantScope, currentTenantConstraint } from '../modules/tenant/scope.js'

// 流程实例列表缓存；键含 where + 分页 + 租户约束（applyCurrentTenantScope 在键生成前注入，
// 防止不同租户同一查询共用缓存键导致跨租户泄漏）
const instanceListCache = createCache<{ rows: WorkflowInstance[]; total: number; page: number; pageSize: number }>({
  namespace: 'wf-instances',
  max: 200,
  maxAgeMs: 30 * 1000,
})

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
    // 触发会新增实例，使实例列表缓存失效
    await instanceListCache.clear()

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
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (bindingKey) where.bindingKey = bindingKey
    if (bindingId) where.bindingId = Number(bindingId)
    // 租户约束必须在缓存键生成前注入：键含租户维度，避免跨租户共用缓存
    applyCurrentTenantScope(where)

    const cacheKey = stableKey({ where, page: Number(page), pageSize: Number(pageSize) })
    const result = await instanceListCache.getOrSet(cacheKey, async () => {
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
      return { rows, total: count, page: Number(page), pageSize: Number(pageSize) }
    })

    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

/** 实例详情（含节点日志与审批记录） */
export const getInstanceDetail = async (req, res, next) => {
  try {
    // 租户约束：普通租户仅可读本租户实例；平台超管不约束
    const tenantWhere = currentTenantConstraint()
    const instance = await WorkflowInstance.findOne({
      where: { id: Number(req.params.id), ...tenantWhere },
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
    // 租户约束：普通租户仅可操作本租户实例；平台超管不约束
    const tenantWhere = currentTenantConstraint()
    const instance = await WorkflowInstance.findOne({ where: { id: Number(req.params.id), ...tenantWhere } })
    if (!instance) throw new AppError(404, '实例不存在')
    if (instance.status !== 'failed' && instance.status !== 'terminated') {
      throw new AppError(400, '仅失败或终止的实例可以重试')
    }

    await instance.update({ status: 'pending', currentNodeKey: null, output: null, runtimeState: null })

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
    // 租户约束：普通租户仅可操作本租户实例；平台超管不约束
    const tenantWhere = currentTenantConstraint()
    const instance = await WorkflowInstance.findOne({ where: { id: Number(req.params.id), ...tenantWhere } })
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

const INSTANCE_STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  running: '运行中',
  partial: '审批中',
  approved: '已通过',
  rejected: '已驳回',
  terminated: '已终止',
  failed: '失败',
}

/** 导出实例列表为 CSV（UTF-8 BOM，Excel 可直接打开） */
export const exportInstances = async (req, res, next) => {
  try {
    const { status, bindingKey, bindingId } = req.query
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (bindingKey) where.bindingKey = bindingKey
    if (bindingId) where.bindingId = Number(bindingId)
    applyCurrentTenantScope(where)

    const rows = await WorkflowInstance.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [
        { model: Workflow, as: 'workflow', attributes: ['id', 'name'] },
        { model: User, as: 'starter', attributes: ['id', 'username', 'nickname'] },
      ],
    })

    const header = ['实例ID', '流程名称', '发起人', '标题', '状态', '创建时间', '结束时间']
    const escapeCsv = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [header.join(',')]
    for (const r of rows) {
      const starter = (r as WorkflowInstance & { starter?: { nickname?: string; username: string } }).starter
      lines.push(
        [
          r.id,
          (r as WorkflowInstance & { workflow?: { name: string } }).workflow?.name || '',
          starter ? starter.nickname || starter.username : '',
          r.title || '',
          INSTANCE_STATUS_LABEL[r.status] || r.status,
          r.createdAt ? new Date(r.createdAt).toISOString() : '',
          r.finishedAt ? new Date(r.finishedAt).toISOString() : '',
        ]
          .map(escapeCsv)
          .join(','),
      )
    }
    const csv = '﻿' + lines.join('\r\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="workflow-instances-${Date.now()}.csv"`)
    res.send(csv)
  } catch (err) {
    next(err)
  }
}
