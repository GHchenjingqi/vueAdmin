import { Op } from 'sequelize'
import sequelize from '../config/database.js'
import Workflow from '../models/Workflow.js'
import WorkflowNode from '../models/WorkflowNode.js'
import WorkflowEdge from '../models/WorkflowEdge.js'
import WorkflowApproverRule from '../models/WorkflowApproverRule.js'
import { getDesign } from './workflowService.js'
import { invalidateWorkflowGraph } from './workflowGraphCache.js'
import { AppError } from '../middleware/errorHandler.js'

interface GraphNodeInput {
  nodeKey: string
  name: string
  type: string
}
interface GraphEdgeInput {
  sourceNodeKey: string
  targetNodeKey: string
}
interface GraphRuleInput {
  nodeKey: string
}

/** 流程合法性校验：开始/结束节点、可达性、审批节点必须有规则、条件节点必须有分支 */
export function validateGraph(
  nodes: GraphNodeInput[],
  edges: GraphEdgeInput[],
  rules: GraphRuleInput[],
): string[] {
  const errors: string[] = []
  if (!nodes.length) {
    errors.push('流程不能为空')
    return errors
  }

  const hasStart = nodes.some((n) => n.type === 'start')
  const hasEnd = nodes.some((n) => n.type === 'end')
  if (!hasStart) errors.push('流程必须包含开始节点')
  if (!hasEnd) errors.push('流程必须包含结束节点')

  // 从开始节点做可达性 BFS
  const startNode = nodes.find((n) => n.type === 'start')
  const reachable = new Set<string>()
  if (startNode) {
    const queue = [startNode.nodeKey]
    while (queue.length) {
      const cur = queue.shift() as string
      if (reachable.has(cur)) continue
      reachable.add(cur)
      for (const e of edges) if (e.sourceNodeKey === cur) queue.push(e.targetNodeKey)
    }
  }
  for (const n of nodes) {
    if (n.type !== 'start' && !reachable.has(n.nodeKey)) {
      errors.push(`节点「${n.name}」不可达（无路径从开始节点到达）`)
    }
  }

  const ruleNodeKeys = new Set(rules.map((r) => r.nodeKey))
  for (const n of nodes) {
    if (n.type === 'approve' && !ruleNodeKeys.has(n.nodeKey)) {
      errors.push(`审批节点「${n.name}」未配置审批人规则`)
    }
  }

  const outCount = new Map<string, number>()
  for (const e of edges) outCount.set(e.sourceNodeKey, (outCount.get(e.sourceNodeKey) ?? 0) + 1)
  for (const n of nodes) {
    if (n.type === 'condition' && (outCount.get(n.nodeKey) ?? 0) === 0) {
      errors.push(`条件节点「${n.name}」没有 outgoing 分支`)
    }
  }

  return errors
}

async function getDraftVersionId(workflowId: number): Promise<number> {
  const workflow = await Workflow.findByPk(workflowId)
  if (!workflow) throw new AppError(404, '流程不存在')
  if (!workflow.draftVersionId) throw new AppError(400, '没有草稿版本')
  return workflow.draftVersionId
}

export async function upsertNode(
  workflowId: number,
  data: {
    nodeKey: string
    name: string
    type: string
    config?: string
    x?: number
    y?: number
  },
) {
  const versionId = await getDraftVersionId(workflowId)
  const [node] = await WorkflowNode.upsert({
    workflowId,
    versionId,
    nodeKey: data.nodeKey,
    name: data.name,
    type: data.type,
    config: data.config ?? null,
    x: data.x ?? null,
    y: data.y ?? null,
  } as any)
  invalidateWorkflowGraph(versionId)
  return node
}

export async function deleteNode(workflowId: number, nodeKey: string) {
  const versionId = await getDraftVersionId(workflowId)
  await WorkflowNode.destroy({ where: { versionId, nodeKey } })
  await WorkflowEdge.destroy({ where: { versionId, sourceNodeKey: nodeKey } })
  await WorkflowEdge.destroy({ where: { versionId, targetNodeKey: nodeKey } })
  await WorkflowApproverRule.destroy({ where: { versionId, nodeKey } })
  invalidateWorkflowGraph(versionId)
}

export async function upsertEdge(
  workflowId: number,
  data: {
    sourceNodeKey: string
    targetNodeKey: string
    sourceHandle?: string
    conditionType?: string
    conditionExpr?: string
  },
) {
  const versionId = await getDraftVersionId(workflowId)
  const [edge] = await WorkflowEdge.upsert({
    workflowId,
    versionId,
    sourceNodeKey: data.sourceNodeKey,
    targetNodeKey: data.targetNodeKey,
    sourceHandle: data.sourceHandle || null,
    conditionType: data.conditionType || 'always',
    conditionExpr: data.conditionExpr || null,
  } as any)
  invalidateWorkflowGraph(versionId)
  return edge
}

export async function deleteEdge(workflowId: number, sourceNodeKey: string, targetNodeKey: string) {
  const versionId = await getDraftVersionId(workflowId)
  await WorkflowEdge.destroy({
    where: { versionId, sourceNodeKey, targetNodeKey },
  })
  invalidateWorkflowGraph(versionId)
}

export async function upsertApproverRule(
  workflowId: number,
  nodeKey: string,
  data: {
    ruleType: string
    ruleConfig?: string
    sort?: number
    name?: string
  },
) {
  const versionId = await getDraftVersionId(workflowId)
  const [rule] = await WorkflowApproverRule.upsert({
    workflowId,
    versionId,
    nodeKey,
    ruleType: data.ruleType,
    ruleConfig: data.ruleConfig || null,
    sort: data.sort ?? 0,
    name: data.name || null,
  } as any)
  invalidateWorkflowGraph(versionId)
  return rule
}

export async function deleteApproverRule(workflowId: number, ruleId: number) {
  const versionId = await getDraftVersionId(workflowId)
  await WorkflowApproverRule.destroy({ where: { id: ruleId, versionId } })
  invalidateWorkflowGraph(versionId)
}

/**
 * 事务化批量保存设计（节点 upsert + 边/规则整版本替换）。
 * 保存前先做图合法性校验，非法图直接拒绝，避免脏数据进入发布流程。
 */
export async function saveDesign(
  workflowId: number,
  payload: {
    nodes: { nodeKey: string; name: string; type: string; config?: string; x?: number; y?: number }[]
    edges: { sourceNodeKey: string; targetNodeKey: string; sourceHandle?: string; conditionType?: string; conditionExpr?: string }[]
    rules: { nodeKey: string; ruleType: string; ruleConfig?: string; sort?: number; name?: string }[]
  },
) {
  const versionId = await getDraftVersionId(workflowId)
  const errors = validateGraph(payload.nodes, payload.edges, payload.rules)
  if (errors.length) throw new AppError(400, `流程校验未通过: ${errors.join('; ')}`)

  const t = await sequelize.transaction()
  try {
    const nodeKeys = payload.nodes.map((n) => n.nodeKey)

    for (const n of payload.nodes) {
      await WorkflowNode.upsert(
        {
          workflowId,
          versionId,
          nodeKey: n.nodeKey,
          name: n.name,
          type: n.type,
          config: n.config ?? null,
          x: n.x ?? null,
          y: n.y ?? null,
        } as any,
        { transaction: t },
      )
    }
    await WorkflowNode.destroy({
      where: nodeKeys.length
        ? { versionId, nodeKey: { [Op.notIn]: nodeKeys } }
        : { versionId },
      transaction: t,
    })

    // 边：整版本替换
    await WorkflowEdge.destroy({ where: { versionId }, transaction: t })
    if (payload.edges.length) {
      await WorkflowEdge.bulkCreate(
        payload.edges.map((e) => ({
          workflowId,
          versionId,
          sourceNodeKey: e.sourceNodeKey,
          targetNodeKey: e.targetNodeKey,
          sourceHandle: e.sourceHandle || null,
          conditionType: e.conditionType || 'always',
          conditionExpr: e.conditionExpr || null,
        })) as any,
        { transaction: t },
      )
    }

    // 规则：整版本替换
    await WorkflowApproverRule.destroy({ where: { versionId }, transaction: t })
    if (payload.rules.length) {
      await WorkflowApproverRule.bulkCreate(
        payload.rules.map((r) => ({
          workflowId,
          versionId,
          nodeKey: r.nodeKey,
          ruleType: r.ruleType,
          ruleConfig: r.ruleConfig || null,
          sort: r.sort ?? 0,
          name: r.name || null,
        })) as any,
        { transaction: t },
      )
    }

    await t.commit()
  } catch (err) {
    await t.rollback()
    throw err
  }
  // 设计变更后，该版本的图谱缓存立即失效，保证运行实例使用最新图
  invalidateWorkflowGraph(versionId)
  return { ok: true }
}

/** 校验当前草稿版本的图合法性 */
export async function validateDesign(workflowId: number) {
  const { nodes, edges, rules } = await getDesign(workflowId)
  const errors = validateGraph(
    nodes.map((n) => ({ nodeKey: n.nodeKey, name: n.name, type: n.type })),
    edges.map((e) => ({ sourceNodeKey: e.sourceNodeKey, targetNodeKey: e.targetNodeKey })),
    rules.map((r) => ({ nodeKey: r.nodeKey })),
  )
  return { valid: errors.length === 0, errors }
}
