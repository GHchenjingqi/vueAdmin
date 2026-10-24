import { Op } from 'sequelize'
import WorkflowInstance from '../models/WorkflowInstance.js'
import WorkflowInstanceLog from '../models/WorkflowInstanceLog.js'
import ApprovalTask from '../models/ApprovalTask.js'
import type WorkflowNode from '../models/WorkflowNode.js'
import { evaluateCondition } from '../utils/workflowExpression.js'
import { resolveApprovers } from '../utils/approvalRuleResolver.js'
import { sendToUser } from '../utils/sseManager.js'
import { logInfo } from '../utils/fileLogger.js'
import { loadGraphCached, type Graph } from './workflowGraphCache.js'

/**
 * 节点级状态机工作流引擎
 *
 * 与旧版「每次从 start 全量重跑」的核心区别：
 * 1. 执行状态持久化在 instance.runtimeState（上下文 / 已完成节点 / 前驱完成集合 / 审批节点状态）。
 * 2. 审批通过后只从「当前已审批节点」向下游续跑（resumeAfterApproval），不再重启整图，
 *    因此多步顺序审批（A→B→C）可以正确推进，且不会产生重复审批任务。
 * 3. 通过 predecessorsDone 实现 AND-join（节点需等全部前驱完成才触发）。
 * 4. 审批任务创建前做去重（已存在 pending 任务则跳过），避免重复派单。
 */

interface ApproverNodeState {
  approvers: number[]
  approved: number[]
  rejected: number[]
  waiting: boolean
}

interface RuntimeState {
  context: Record<string, unknown>
  started: string[]
  completed: string[]
  predecessorsDone: Record<string, string[]>
  nodeData: Record<string, ApproverNodeState>
  finished: boolean
}

type InstanceStatus = 'pending' | 'running' | 'partial' | 'approved' | 'rejected' | 'terminated' | 'failed'

function emptyState(input: Record<string, unknown>): RuntimeState {
  return {
    context: { ...input },
    started: [],
    completed: [],
    predecessorsDone: {},
    nodeData: {},
    finished: false,
  }
}

function parseState(instance: WorkflowInstance): RuntimeState | null {
  if (!instance.runtimeState) return null
  try {
    const parsed = JSON.parse(instance.runtimeState) as Partial<RuntimeState>
    return {
      context: parsed.context ?? {},
      started: parsed.started ?? [],
      completed: parsed.completed ?? [],
      predecessorsDone: parsed.predecessorsDone ?? {},
      nodeData: parsed.nodeData ?? {},
      finished: parsed.finished ?? false,
    }
  } catch {
    return null
  }
}

export default class WorkflowEngine {
  /** 初始触发 / 重试：从 start 节点开始执行 */
  async execute(instance: WorkflowInstance): Promise<void> {
    try {
      const graph = await loadGraphCached(instance.versionId)
      const startNode = [...graph.nodeMap.values()].find((n) => n.type === 'start')
      if (!startNode) {
        await this.commit(instance, emptyState({}), { status: 'failed' as InstanceStatus, finishedAt: new Date() })
        logInfo(`工作流实例 [${instance.id}] 无开始节点，执行失败`)
        return
      }

      const existing = parseState(instance)
      // 已在运行/等待中的实例不允许整图重跑（避免旧版重复派单缺陷）
      if (existing && existing.started.length > 0 && ['running', 'partial'].includes(instance.status)) {
        logInfo(`工作流实例 [${instance.id}] 已在运行，跳过整图重跑`)
        return
      }

      const state = emptyState(instance.input ? JSON.parse(instance.input) : {})
      await this.commit(instance, state, { status: 'running' as InstanceStatus, startedAt: instance.startedAt || new Date() })
      await this.processNode(instance, graph, state, startNode.nodeKey)
    } catch (err: any) {
      logInfo(`工作流实例 [${instance.id}] 执行异常: ${err?.message ?? err}`)
      await instance.update({ status: 'failed', finishedAt: new Date() }).catch(() => {})
    }
  }

  /** 审批通过/驳回后，从被审批节点向下游续跑（不再从 start 重跑） */
  async resumeAfterApproval(
    instance: WorkflowInstance,
    nodeKey: string,
    approverId: number,
    decision: 'approved' | 'rejected',
  ): Promise<void> {
    try {
      const state = parseState(instance)
      if (!state || state.finished) return
      const nodeData = state.nodeData[nodeKey]
      if (!nodeData) return

      const graph = await loadGraphCached(instance.versionId)

      if (decision === 'rejected') {
        if (!nodeData.rejected.includes(approverId)) nodeData.rejected.push(approverId)
        // 任一审批人驳回即终止整个实例（如需分支回退可在此扩展）
        await ApprovalTask.update(
          { status: 'canceled' },
          { where: { instanceId: instance.id, status: 'pending', approverId: { [Op.ne]: approverId } } },
        )
        await this.finalize(instance, state, 'rejected')
        return
      }

      if (!nodeData.approved.includes(approverId)) nodeData.approved.push(approverId)
      const allApproved = nodeData.approvers.length > 0 && nodeData.approvers.every((a) => nodeData!.approved.includes(a))
      if (!allApproved) {
        // 还有其它审批人未处理，继续等待
        await this.commit(instance, state, {})
        return
      }

      // 本节点审批全部通过 → 标记完成并向下游推进
      const outEdges = graph.outEdges.get(nodeKey) || []
      const nextKeys = outEdges.map((e) => e.targetNodeKey)
      const log = await WorkflowInstanceLog.create({
        instanceId: instance.id,
        nodeKey,
        nodeName: graph.nodeMap.get(nodeKey)?.name ?? nodeKey,
        nodeType: graph.nodeMap.get(nodeKey)?.type ?? 'approve',
        status: 'running',
        input: JSON.stringify(state.context),
        startedAt: new Date(),
      })
      await this.completeNode(instance, graph, state, nodeKey, log, nextKeys)
      await this.advance(instance, graph, state, nodeKey, nextKeys)
      await this.commit(instance, state, {})
    } catch (err: any) {
      logInfo(`工作流实例 [${instance.id}] 审批续跑异常: ${err?.message ?? err}`)
      await instance.update({ status: 'failed', finishedAt: new Date() }).catch(() => {})
    }
  }

  private async processNode(
    instance: WorkflowInstance,
    graph: Graph,
    state: RuntimeState,
    nodeKey: string,
  ): Promise<void> {
    const node = graph.nodeMap.get(nodeKey)
    if (!node || state.completed.includes(nodeKey)) return
    if (!state.started.includes(nodeKey)) state.started.push(nodeKey)

    await instance.update({ currentNodeKey: nodeKey })
    const log = await WorkflowInstanceLog.create({
      instanceId: instance.id,
      nodeKey,
      nodeName: node.name,
      nodeType: node.type,
      status: 'running',
      input: JSON.stringify(state.context),
      startedAt: new Date(),
    })

    try {
      const outEdges = graph.outEdges.get(nodeKey) || []
      let nextKeys: string[] = []

      switch (node.type) {
        case 'start':
          nextKeys = outEdges.map((e) => e.targetNodeKey)
          break

        case 'end':
          await this.completeNode(instance, graph, state, nodeKey, log, [])
          await this.finalize(instance, state, 'approved')
          return

        case 'condition':
          for (const e of outEdges) {
            if (e.conditionType === 'always') {
              nextKeys.push(e.targetNodeKey)
            } else if (e.conditionExpr && evaluateCondition(e.conditionExpr, state.context as Record<string, unknown>)) {
              nextKeys.push(e.targetNodeKey)
            }
          }
          break

        case 'notify': {
          await this.createNotice(node)
          nextKeys = outEdges.map((e) => e.targetNodeKey)
          break
        }

        case 'approve': {
          const nodeRules = graph.rulesByNode.get(nodeKey) || []
          if (nodeRules.length === 0) {
            nextKeys = outEdges.map((e) => e.targetNodeKey)
            break
          }
          const approverIds = await resolveApprovers(
            nodeRules.map((r) => ({ ruleType: r.ruleType, ruleConfig: r.ruleConfig })),
            { startedBy: instance.startedBy || 0 },
          )
          if (approverIds.length === 0) {
            nextKeys = outEdges.map((e) => e.targetNodeKey)
            break
          }

          // 去重：已存在 pending 任务则不再重复派单
          const existing = await ApprovalTask.findAll({ where: { instanceId: instance.id, nodeKey, status: 'pending' } })
          const existingIds = new Set(existing.map((t) => t.approverId))
          const nd: ApproverNodeState = state.nodeData[nodeKey] || { approvers: [], approved: [], rejected: [], waiting: false }

          // N+1 优化：逐审批人串行 create 改为一次性 bulkCreate（去重后仅插入缺失者）
          const toCreate = approverIds.filter((aid) => !existingIds.has(aid))
          if (toCreate.length > 0) {
            await ApprovalTask.bulkCreate(
              toCreate.map((aid) => ({
                instanceId: instance.id,
                nodeKey,
                title: instance.title || '审批',
                status: 'pending' as const,
                approverId: aid,
                approverName: null,
                assignedAt: new Date(),
                dueAt: this.computeDueAt(node),
              })),
            )
            // MySQL bulkCreate 不回填自增 id，单独一次查询取回刚插入的任务（含 id）用于通知
            const created = await ApprovalTask.findAll({
              where: { instanceId: instance.id, nodeKey, approverId: { [Op.in]: toCreate } },
            })
            for (const task of created) {
              sendToUser(task.approverId, 'approval', {
                taskId: task.id,
                instanceId: instance.id,
                title: instance.title,
                message: '您有一个新的审批任务',
              })
            }
          }
          // 审批人集合 = 已存在 + 本次新派（保持顺序稳定）
          nd.approvers = Array.from(new Set([...nd.approvers, ...approverIds]))
          state.nodeData[nodeKey] = nd

          await log.update({ status: 'success', output: JSON.stringify({ approverIds, waiting: true }), finishedAt: new Date(), duration: 0 })
          // 等待审批：不标记完成，实例进入等待态
          await this.commit(instance, state, { status: 'partial' as InstanceStatus })
          return
        }
      }

      await this.completeNode(instance, graph, state, nodeKey, log, nextKeys)
      await this.advance(instance, graph, state, nodeKey, nextKeys)
      await this.commit(instance, state, {})
    } catch (err: any) {
      await log.update({ status: 'failed', error: err?.message ?? String(err), finishedAt: new Date() }).catch(() => {})
      await instance.update({ status: 'failed', finishedAt: new Date() }).catch(() => {})
      logInfo(`工作流实例 [${instance.id}] 节点 [${nodeKey}] 执行失败: ${err?.message ?? err}`)
    }
  }

  private async completeNode(
    instance: WorkflowInstance,
    _graph: Graph,
    state: RuntimeState,
    nodeKey: string,
    log: WorkflowInstanceLog,
    _nextKeys: string[],
  ): Promise<void> {
    if (!state.completed.includes(nodeKey)) state.completed.push(nodeKey)
    await log.update({ status: 'success', output: JSON.stringify({ completed: true }), finishedAt: new Date(), duration: 0 }).catch(() => {})
  }

  /** 推进：把 fromKey 加入各下游节点的前驱完成集合，满足 AND-join（入度）条件且未启动时才触发 */
  private async advance(
    instance: WorkflowInstance,
    graph: Graph,
    state: RuntimeState,
    fromKey: string,
    nextKeys: string[],
  ): Promise<void> {
    for (const target of nextKeys) {
      const pd = state.predecessorsDone[target] || []
      if (!pd.includes(fromKey)) pd.push(fromKey)
      state.predecessorsDone[target] = pd

      const indeg = graph.indegree.get(target) ?? 0
      if (pd.length >= indeg && !state.started.includes(target)) {
        await this.processNode(instance, graph, state, target)
      }
    }
  }

  private async finalize(instance: WorkflowInstance, state: RuntimeState, status: 'approved' | 'rejected'): Promise<void> {
    state.finished = true
    await this.commit(instance, state, {
      status: status as InstanceStatus,
      currentNodeKey: null,
      output: JSON.stringify(state.context),
      finishedAt: new Date(),
    })
    logInfo(`工作流实例 [${instance.id}] 结束，状态: ${status}`)
  }

  /** 写入 runtimeState 并保存实例指定字段 */
  private async commit(instance: WorkflowInstance, state: RuntimeState, patch: Record<string, unknown>): Promise<void> {
    instance.runtimeState = JSON.stringify(state)
    Object.assign(instance, patch)
    await instance.save()
  }

  private async createNotice(node: WorkflowNode): Promise<void> {
    try {
      const config = node.config ? JSON.parse(node.config) : {}
      const { default: Notice } = await import('../models/Notice.js')
      await Notice.create({
        title: config.title || '系统通知',
        content: config.content || '您有一条工作流通知',
        type: 'notice',
        status: 'published',
        publisherId: 0,
        publisherName: '系统',
        publishTime: new Date(),
      } as any)
    } catch {
      // 通知发送失败不影响流程推进
    }
  }

  private computeDueAt(node: WorkflowNode): Date | null {
    if (!node.config) return null
    try {
      const config = JSON.parse(node.config) as { timeoutHours?: number }
      if (typeof config.timeoutHours === 'number' && config.timeoutHours > 0) {
        return new Date(Date.now() + config.timeoutHours * 3600 * 1000)
      }
    } catch {
      // ignore
    }
    return null
  }
}
