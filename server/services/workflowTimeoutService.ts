import { Op } from 'sequelize'
import ApprovalTask from '../models/ApprovalTask.js'
import WorkflowInstance from '../models/WorkflowInstance.js'
import WorkflowNode from '../models/WorkflowNode.js'
import WorkflowEngine from './WorkflowEngine.js'
import { sendToUser } from '../utils/sseManager.js'
import { logInfo } from '../utils/fileLogger.js'

/**
 * 扫描超时未审批任务：
 * - 默认：向审批人发送催办提醒。
 * - 节点配置 timeoutAction=auto_approve：自动通过（沿用引擎续跑逻辑，保证多步流程正确推进）。
 *
 * 由 app.ts 中 env 门控的 node-cron 周期性调用，默认关闭（WORKFLOW_TIMEOUT_CRON=1 启用）。
 */
export async function processOverdueTasks(): Promise<{ reminded: number; autoApproved: number }> {
  const now = new Date()
  const overdue = await ApprovalTask.findAll({
    where: { status: 'pending', dueAt: { [Op.lt]: now } },
  })
  if (overdue.length === 0) return { reminded: 0, autoApproved: 0 }

  // N+1 优化：批量取出所有涉及的实例与节点，避免每个任务各发 2 次查询
  const instanceIds = [...new Set(overdue.map((t) => t.instanceId))]
  const instances = await WorkflowInstance.findAll({ where: { id: { [Op.in]: instanceIds } } })
  const instanceMap = new Map<number, WorkflowInstance>(instances.map((i) => [i.id, i]))

  const pairSeen = new Set<string>()
  const nodePairs: { versionId: number; nodeKey: string }[] = []
  for (const t of overdue) {
    const inst = instanceMap.get(t.instanceId)
    if (!inst) continue
    const k = `${inst.versionId}:${t.nodeKey}`
    if (pairSeen.has(k)) continue
    pairSeen.add(k)
    nodePairs.push({ versionId: inst.versionId, nodeKey: t.nodeKey })
  }
  const nodeMap = new Map<string, WorkflowNode>()
  if (nodePairs.length > 0) {
    const nodes = await WorkflowNode.findAll({
      where: { [Op.or]: nodePairs.map((p) => ({ versionId: p.versionId, nodeKey: p.nodeKey })) },
    })
    for (const n of nodes) nodeMap.set(`${n.versionId}:${n.nodeKey}`, n)
  }

  let reminded = 0
  let autoApproved = 0

  for (const task of overdue) {
    const instance = instanceMap.get(task.instanceId)
    if (!instance) continue
    const nodeDef = nodeMap.get(`${instance.versionId}:${task.nodeKey}`)
    if (!nodeDef) continue

    let autoApprove = false
    if (nodeDef.config) {
      try {
        const cfg = JSON.parse(nodeDef.config) as { timeoutAction?: string }
        autoApprove = cfg.timeoutAction === 'auto_approve'
      } catch {
        // 配置解析失败忽略
      }
    }

    if (autoApprove && task.approverId) {
      const engine = new WorkflowEngine()
      await engine.resumeAfterApproval(instance, task.nodeKey, task.approverId, 'approved')
      autoApproved++
      continue
    }

    if (task.approverId) {
      sendToUser(task.approverId, 'approval-reminder', {
        taskId: task.id,
        instanceId: instance.id,
        title: instance.title,
        message: '您有一条超时审批任务，请尽快处理',
      })
    }
    reminded++
  }

  if (reminded || autoApproved) logInfo(`工作流超时任务处理：催办 ${reminded}，自动通过 ${autoApproved}`)
  return { reminded, autoApproved }
}
