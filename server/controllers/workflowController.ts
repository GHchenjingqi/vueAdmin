/**
 * 工作流定义与设计控制器
 *
 * 职责：仅做 HTTP 请求/响应编排，业务逻辑委托给 workflowService / workflowDesignService
 */
import * as workflowService from '../services/workflowService.js'
import * as workflowDesignService from '../services/workflowDesignService.js'
import WorkflowBinding from '../models/WorkflowBinding.js'
import { logOperation } from '../utils/logger.js'

/** 获取工作流列表（分页 + 搜索） */
export const list = async (req, res, next) => {
  try {
    const data = await workflowService.listWorkflows(req.query)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/** 获取单个工作流 */
export const getById = async (req, res, next) => {
  try {
    const workflow = await workflowService.getWorkflowById(Number(req.params.id))
    res.json({ code: 0, data: workflow })
  } catch (err) {
    next(err)
  }
}

/** 创建工作流 */
export const create = async (req, res, next) => {
  try {
    const { workflow } = await workflowService.createWorkflow({ ...req.body, createdBy: req.user?.id })
    logOperation(req, '创建工作流', `流程: ${workflow.name}`)
    res.status(201).json({ code: 0, data: { id: workflow.id }, message: '创建成功' })
  } catch (err) {
    next(err)
  }
}

/** 更新工作流 */
export const update = async (req, res, next) => {
  try {
    const workflow = await workflowService.updateWorkflow(Number(req.params.id), req.body)
    logOperation(req, '更新工作流', `流程: ${workflow.name}`)
    res.json({ code: 0, message: '更新成功' })
  } catch (err) {
    next(err)
  }
}

/** 删除工作流 */
export const remove = async (req, res, next) => {
  try {
    await workflowService.deleteWorkflow(Number(req.params.id))
    logOperation(req, '删除工作流', `ID: ${req.params.id}`)
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}

/** 启用/禁用工作流 */
export const toggle = async (req, res, next) => {
  try {
    const workflow = await workflowService.toggleWorkflow(Number(req.params.id), req.body.enabled !== false)
    res.json({ code: 0, message: workflow.status === 1 ? '已启用' : '已禁用' })
  } catch (err) {
    next(err)
  }
}

/** 发布工作流（版本冻结） */
export const publish = async (req, res, next) => {
  try {
    const result = await workflowService.publishWorkflow(Number(req.params.id), req.user?.id)
    logOperation(req, '发布工作流', `流程: ${result.workflow.name}, 版本: ${result.publishedVersion.versionNo}`)
    res.json({ code: 0, message: '发布成功' })
  } catch (err) {
    next(err)
  }
}

/** 获取草稿设计（节点 + 边 + 审批人规则） */
export const getDesign = async (req, res, next) => {
  try {
    const design = await workflowService.getDesign(Number(req.params.id))
    res.json({ code: 0, data: design })
  } catch (err) {
    next(err)
  }
}

/** 新增/更新节点 */
export const upsertNode = async (req, res, next) => {
  try {
    const node = await workflowDesignService.upsertNode(Number(req.params.id), req.body)
    res.json({ code: 0, data: node })
  } catch (err) {
    next(err)
  }
}

/** 删除节点（连带删除其边与审批人规则） */
export const deleteNode = async (req, res, next) => {
  try {
    await workflowDesignService.deleteNode(Number(req.params.id), req.params.nodeKey)
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}

/** 新增/更新边 */
export const upsertEdge = async (req, res, next) => {
  try {
    const edge = await workflowDesignService.upsertEdge(Number(req.params.id), req.body)
    res.json({ code: 0, data: edge })
  } catch (err) {
    next(err)
  }
}

/** 删除边 */
export const deleteEdge = async (req, res, next) => {
  try {
    await workflowDesignService.deleteEdge(Number(req.params.id), req.params.sourceKey, req.params.targetKey)
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}

/** 新增/更新审批人规则 */
export const upsertApproverRule = async (req, res, next) => {
  try {
    const rule = await workflowDesignService.upsertApproverRule(Number(req.params.id), req.params.nodeKey, req.body)
    res.json({ code: 0, data: rule })
  } catch (err) {
    next(err)
  }
}

/** 删除审批人规则 */
export const deleteApproverRule = async (req, res, next) => {
  try {
    await workflowDesignService.deleteApproverRule(Number(req.params.id), Number(req.params.ruleId))
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}

/** 创建流程绑定 */
export const createBinding = async (req, res, next) => {
  try {
    const binding = await WorkflowBinding.create(req.body)
    logOperation(req, '创建流程绑定', `key: ${binding.bindingKey}`)
    res.status(201).json({ code: 0, data: { id: binding.id }, message: '绑定成功' })
  } catch (err) {
    next(err)
  }
}

/** 获取流程绑定列表 */
export const listBindings = async (req, res, next) => {
  try {
    const bindings = await WorkflowBinding.findAll()
    res.json({ code: 0, data: bindings })
  } catch (err) {
    next(err)
  }
}

/** 删除流程绑定 */
export const deleteBinding = async (req, res, next) => {
  try {
    const binding = await WorkflowBinding.findByPk(Number(req.params.id))
    if (!binding) {
      res.status(404).json({ code: 404, message: '绑定不存在' })
      return
    }
    await binding.destroy()
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}