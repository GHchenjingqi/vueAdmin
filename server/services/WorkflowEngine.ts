import WorkflowNode from '../models/WorkflowNode.js'
import WorkflowEdge from '../models/WorkflowEdge.js'
import WorkflowApproverRule from '../models/WorkflowApproverRule.js'
import WorkflowInstance from '../models/WorkflowInstance.js'
import WorkflowInstanceLog from '../models/WorkflowInstanceLog.js'
import ApprovalTask from '../models/ApprovalTask.js'
import { evaluateCondition } from '../utils/workflowExpression.js'
import { resolveApprovers } from '../utils/approvalRuleResolver.js'
import { sendToUser } from '../utils/sseManager.js'
import { logInfo } from '../utils/fileLogger.js'

export default class WorkflowEngine {
  async execute(instance: WorkflowInstance): Promise<void> {
    try {
      const versionId = instance.versionId
      const nodes = await WorkflowNode.findAll({ where: { versionId } })
      const edges = await WorkflowEdge.findAll({ where: { versionId } })
      const rules = await WorkflowApproverRule.findAll({ where: { versionId } })

      const nodeMap = new Map<string, WorkflowNode>()
      for (const n of nodes) nodeMap.set(n.nodeKey, n)

      const edgeMap = new Map<string, WorkflowEdge[]>()
      for (const e of edges) {
        const list = edgeMap.get(e.sourceNodeKey) || []
        list.push(e)
        edgeMap.set(e.sourceNodeKey, list)
      }

      const rulesByNode = new Map<string, WorkflowApproverRule[]>()
      for (const r of rules) {
        const list = rulesByNode.get(r.nodeKey) || []
        list.push(r)
        rulesByNode.set(r.nodeKey, list)
      }

      await instance.update({ status: 'running', startedAt: instance.startedAt || new Date() })

      const startNode = nodes.find(n => n.type === 'start')
      if (!startNode) {
        await instance.update({ status: 'failed', finishedAt: new Date() })
        return
      }

      const input = instance.input ? JSON.parse(instance.input) : {}
      const context: Record<string, any> = { ...input }

      await this.traverse(startNode.nodeKey, nodeMap, edgeMap, rulesByNode, instance, context, new Set())

      const finalStatus = instance.status === 'running' ? 'approved' : instance.status
      await instance.update({
        status: finalStatus,
        currentNodeKey: null,
        output: JSON.stringify(context),
        finishedAt: new Date(),
      })

      logInfo(`工作流实例 [${instance.id}] 完成，状态: ${finalStatus}`)
    } catch (err: any) {
      logInfo(`工作流实例 [${instance.id}] 执行异常: ${err.message}`)
      await instance.update({ status: 'failed', finishedAt: new Date() }).catch(() => {})
    }
  }

  private async traverse(
    currentNodeKey: string,
    nodeMap: Map<string, WorkflowNode>,
    edgeMap: Map<string, WorkflowEdge[]>,
    rulesByNode: Map<string, WorkflowApproverRule[]>,
    instance: WorkflowInstance,
    context: Record<string, any>,
    visited: Set<string>,
  ): Promise<void> {
    if (visited.has(currentNodeKey)) return
    visited.add(currentNodeKey)

    const node = nodeMap.get(currentNodeKey)
    if (!node) return

    await instance.update({ currentNodeKey })

    const log = await WorkflowInstanceLog.create({
      instanceId: instance.id,
      nodeKey: node.nodeKey,
      nodeName: node.name,
      nodeType: node.type,
      status: 'running',
      input: JSON.stringify(context),
      startedAt: new Date(),
    })

    try {
      let nextKeys: string[] = []
      const outEdges = edgeMap.get(currentNodeKey) || []

      switch (node.type) {
        case 'start':
          nextKeys = outEdges.map(e => e.targetNodeKey)
          break

        case 'end':
          await log.update({ status: 'success', output: '{}', finishedAt: new Date(), duration: 0 })
          return

        case 'condition': {
          for (const edge of outEdges) {
            if (edge.conditionType === 'always') {
              nextKeys.push(edge.targetNodeKey)
            } else if (edge.conditionExpr) {
              const matched = evaluateCondition(edge.conditionExpr, context)
              if (matched) {
                nextKeys.push(edge.targetNodeKey)
              }
            }
          }
          break
        }

        case 'approve': {
          const nodeRules = rulesByNode.get(node.nodeKey) || []
          if (nodeRules.length === 0) {
            nextKeys = outEdges.map(e => e.targetNodeKey)
          } else {
            const approverIds = await resolveApprovers(nodeRules, { startedBy: instance.startedBy || 0 })
            if (approverIds.length === 0) {
              nextKeys = outEdges.map(e => e.targetNodeKey)
            } else {
              for (const approverId of approverIds) {
                const task = await ApprovalTask.create({
                  instanceId: instance.id,
                  nodeKey: node.nodeKey,
                  title: instance.title || '审批',
                  status: 'pending',
                  approverId,
                  assignedAt: new Date(),
                })
                sendToUser(approverId, 'approval', {
                  taskId: task.id,
                  instanceId: instance.id,
                  title: instance.title,
                  message: '您有一个新的审批任务',
                })
              }
              await instance.update({ status: 'partial' })
              await log.update({ status: 'success', output: JSON.stringify({ approverIds }), finishedAt: new Date(), duration: 0 })
              return
            }
          }
          break
        }

        case 'notify': {
          const config = node.config ? JSON.parse(node.config) : {}
          try {
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
          } catch {}
          nextKeys = outEdges.map(e => e.targetNodeKey)
          break
        }
      }

      const duration = log.startedAt ? Date.now() - new Date(log.startedAt).getTime() : 0
      await log.update({ status: 'success', output: JSON.stringify({ nextKeys }), finishedAt: new Date(), duration })

      for (const nextKey of nextKeys) {
        await this.traverse(nextKey, nodeMap, edgeMap, rulesByNode, instance, context, visited)
      }

      if (instance.status === 'partial') {
        const pendingCount = await ApprovalTask.count({
          where: { instanceId: instance.id, nodeKey: currentNodeKey, status: 'pending' },
        })
        if (pendingCount === 0) {
          for (const nextKey of nextKeys) {
            await this.traverse(nextKey, nodeMap, edgeMap, rulesByNode, instance, context, visited)
          }
        }
      }
    } catch (err: any) {
      await log.update({ status: 'failed', error: err.message, finishedAt: new Date() })
      throw err
    }
  }
}