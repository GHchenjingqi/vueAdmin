import { Op } from 'sequelize'
import Workflow from '../models/Workflow.js'
import WorkflowVersion from '../models/WorkflowVersion.js'
import WorkflowNode from '../models/WorkflowNode.js'
import WorkflowEdge from '../models/WorkflowEdge.js'
import WorkflowApproverRule from '../models/WorkflowApproverRule.js'
import WorkflowBinding from '../models/WorkflowBinding.js'
import { AppError } from '../middleware/errorHandler.js'

export async function listWorkflows(params: { keyword?: string; status?: number | string; page?: number; pageSize?: number }) {
  const { keyword, status } = params
  const pageNum = Number(params.page) || 1
  const pageSizeNum = Number(params.pageSize) || 10
  const where: any = {}
  // 空字符串 / null / undefined 视为不筛选（前端 ProTable 默认会带空 status 参数）
  if (status !== undefined && status !== null && status !== '') where.status = Number(status)
  if (keyword) where.name = { [Op.like]: `%${keyword}%` }

  const { rows, count } = await Workflow.findAndCountAll({
    where,
    offset: (pageNum - 1) * pageSizeNum,
    limit: pageSizeNum,
    order: [['createdAt', 'DESC']],
  })

  return { rows, total: count, page: pageNum, pageSize: pageSizeNum }
}

export async function getWorkflowById(id: number) {
  const workflow = await Workflow.findByPk(id)
  if (!workflow) throw new AppError(404, '流程不存在')
  return workflow
}

export async function createWorkflow(data: { name: string; description?: string; createdBy?: number }) {
  const workflow = await Workflow.create({
    name: data.name,
    description: data.description || null,
    createdBy: data.createdBy || null,
  })

  const version = await WorkflowVersion.create({
    workflowId: workflow.id,
    versionNo: 1,
    status: 'draft',
  })

  await workflow.update({ draftVersionId: version.id })

  return { workflow, version }
}

export async function updateWorkflow(id: number, data: { name?: string; description?: string; status?: number }) {
  const workflow = await getWorkflowById(id)
  await workflow.update(data)
  return workflow
}

export async function deleteWorkflow(id: number) {
  const workflow = await getWorkflowById(id)
  await WorkflowNode.destroy({ where: { workflowId: id } })
  await WorkflowEdge.destroy({ where: { workflowId: id } })
  await WorkflowApproverRule.destroy({ where: { workflowId: id } })
  await WorkflowVersion.destroy({ where: { workflowId: id } })
  await WorkflowBinding.destroy({ where: { workflowId: id } })
  await workflow.destroy()
}

export async function toggleWorkflow(id: number, enabled: boolean) {
  const workflow = await getWorkflowById(id)
  await workflow.update({ status: enabled ? 1 : 0 })
  return workflow
}

export async function publishWorkflow(id: number, userId: number) {
  const workflow = await getWorkflowById(id)
  const draftVersion = await WorkflowVersion.findByPk(workflow.draftVersionId)
  if (!draftVersion) throw new AppError(400, '没有草稿版本可发布')

  const nodes = await WorkflowNode.findAll({ where: { versionId: draftVersion.id } })
  const hasStart = nodes.some(n => n.type === 'start')
  const hasEnd = nodes.some(n => n.type === 'end')
  if (!hasStart || !hasEnd) throw new AppError(400, '流程必须包含开始和结束节点')

  const edges = await WorkflowEdge.findAll({ where: { versionId: draftVersion.id } })
  const nodeKeys = new Set(nodes.map(n => n.nodeKey))
  for (const edge of edges) {
    if (!nodeKeys.has(edge.sourceNodeKey)) throw new AppError(400, `边引用了不存在的源节点: ${edge.sourceNodeKey}`)
    if (!nodeKeys.has(edge.targetNodeKey)) throw new AppError(400, `边引用了不存在的目标节点: ${edge.targetNodeKey}`)
  }

  await draftVersion.update({
    status: 'published',
    publishedAt: new Date(),
    publishedBy: userId,
  })

  await workflow.update({ publishedVersionId: draftVersion.id })

  const newVersion = await WorkflowVersion.create({
    workflowId: id,
    versionNo: draftVersion.versionNo + 1,
    status: 'draft',
  })

  await workflow.update({ draftVersionId: newVersion.id })

  return { workflow, publishedVersion: draftVersion, newDraftVersion: newVersion }
}

export async function getDesign(id: number) {
  const workflow = await getWorkflowById(id)
  if (!workflow.draftVersionId) throw new AppError(400, '没有草稿版本')

  const [nodes, edges, rules] = await Promise.all([
    WorkflowNode.findAll({ where: { versionId: workflow.draftVersionId }, order: [['id', 'ASC']] }),
    WorkflowEdge.findAll({ where: { versionId: workflow.draftVersionId }, order: [['id', 'ASC']] }),
    WorkflowApproverRule.findAll({ where: { versionId: workflow.draftVersionId }, order: [['sort', 'ASC']] }),
  ])

  return { nodes, edges, rules }
}