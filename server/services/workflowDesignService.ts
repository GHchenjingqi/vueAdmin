import Workflow from '../models/Workflow.js'
import WorkflowNode from '../models/WorkflowNode.js'
import WorkflowEdge from '../models/WorkflowEdge.js'
import WorkflowApproverRule from '../models/WorkflowApproverRule.js'
import { AppError } from '../middleware/errorHandler.js'

async function getDraftVersionId(workflowId: number): Promise<number> {
  const workflow = await Workflow.findByPk(workflowId)
  if (!workflow) throw new AppError(404, '流程不存在')
  if (!workflow.draftVersionId) throw new AppError(400, '没有草稿版本')
  return workflow.draftVersionId
}

export async function upsertNode(workflowId: number, data: {
  nodeKey: string; name: string; type: string; config?: string; x?: number; y?: number
}) {
  const versionId = await getDraftVersionId(workflowId)
  const [node] = await WorkflowNode.upsert({
    workflowId, versionId, nodeKey: data.nodeKey,
    name: data.name, type: data.type,
    config: data.config || null,
    x: data.x ?? null, y: data.y ?? null,
  } as any)
  return node
}

export async function deleteNode(workflowId: number, nodeKey: string) {
  const versionId = await getDraftVersionId(workflowId)
  await WorkflowNode.destroy({ where: { versionId, nodeKey } })
  await WorkflowEdge.destroy({ where: { versionId, sourceNodeKey: nodeKey } })
  await WorkflowEdge.destroy({ where: { versionId, targetNodeKey: nodeKey } })
  await WorkflowApproverRule.destroy({ where: { versionId, nodeKey } })
}

export async function upsertEdge(workflowId: number, data: {
  sourceNodeKey: string; targetNodeKey: string; conditionType?: string; conditionExpr?: string
}) {
  const versionId = await getDraftVersionId(workflowId)
  const [edge] = await WorkflowEdge.upsert({
    workflowId, versionId,
    sourceNodeKey: data.sourceNodeKey,
    targetNodeKey: data.targetNodeKey,
    conditionType: data.conditionType || 'always',
    conditionExpr: data.conditionExpr || null,
  } as any)
  return edge
}

export async function deleteEdge(workflowId: number, sourceNodeKey: string, targetNodeKey: string) {
  const versionId = await getDraftVersionId(workflowId)
  await WorkflowEdge.destroy({
    where: { versionId, sourceNodeKey, targetNodeKey },
  })
}

export async function upsertApproverRule(workflowId: number, nodeKey: string, data: {
  ruleType: string; ruleConfig?: string; sort?: number; name?: string
}) {
  const versionId = await getDraftVersionId(workflowId)
  const [rule] = await WorkflowApproverRule.upsert({
    workflowId, versionId, nodeKey,
    ruleType: data.ruleType,
    ruleConfig: data.ruleConfig || null,
    sort: data.sort ?? 0,
    name: data.name || null,
  } as any)
  return rule
}

export async function deleteApproverRule(workflowId: number, ruleId: number) {
  const versionId = await getDraftVersionId(workflowId)
  await WorkflowApproverRule.destroy({ where: { id: ruleId, versionId } })
}