import { Op } from 'sequelize'
import ApprovalTask from '../models/ApprovalTask.js'
import WorkflowInstance from '../models/WorkflowInstance.js'
import WorkflowNode from '../models/WorkflowNode.js'
import WorkflowEngine from './WorkflowEngine.js'
import { sendToUser } from '../utils/sseManager.js'
import { logInfo } from '../utils/fileLogger.js'
import { resolveDirectLeader } from '../utils/approvalRuleResolver.js'

interface NodeConfig {
  timeoutHours?: number
  remindHours?: number
  escalateHours?: number
  escalateTo?: { type: 'leader' | 'user'; userIds?: number[] }
  timeoutAction?: string
}

interface EscalateTo {
  type: 'leader' | 'user'
  userIds?: number[]
}

/**
 * 扫描超时 / 临期审批任务，支持三种超时策略（节点 config 配置）：
 * - remindHours：到期前 N 小时向审批人发送催办提醒（仅一次）。
 * - 超过 dueAt（由 timeoutHours 计算）：
 *   - timeoutAction=auto_approve：自动通过（沿用引擎续跑，保证多步流程正确推进）。
 *   - escalateTo 配置：自动升级转交（上级或指定人），并通知新处理人。
 *   - 默认：发送超时催办提醒。
 *
 * 由 app.ts 中 env 门控的 node-cron 周期性调用，默认关闭（WORKFLOW_TIMEOUT_CRON=1 启用）。
 */
export async function scanWorkflowTimeouts(): Promise<{ reminded: number; autoApproved: number; escalated: number }> {
  const now = new Date()
  const pending = await ApprovalTask.findAll({ where: { status: 'pending' } })
  if (pending.length === 0) return { reminded: 0, autoApproved: 0, escalated: 0 }

  // 批量取出所有涉及的实例与节点，避免 N+1
  const instanceIds = [...new Set(pending.map((t) => t.instanceId))]
  const instances = await WorkflowInstance.findAll({ where: { id: { [Op.in]: instanceIds } } })
  const instanceMap = new Map<number, WorkflowInstance>(instances.map((i) => [i.id, i]))

  const pairSeen = new Set<string>()
  const nodePairs: { versionId: number; nodeKey: string }[] = []
  for (const t of pending) {
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
  let escalated = 0

  for (const task of pending) {
    const instance = instanceMap.get(task.instanceId)
    if (!instance) continue
    const nodeDef = nodeMap.get(`${instance.versionId}:${task.nodeKey}`)
    const cfg: NodeConfig = nodeDef?.config ? safeParse(nodeDef.config) : {}

    const assignedAt = task.assignedAt ? new Date(task.assignedAt).getTime() : 0
    const elapsedMs = now.getTime() - assignedAt

    // 到期前提醒（仅一次）
    if (cfg.remindHours && !task.remindedAt) {
      const remindMs = Number(cfg.remindHours) * 3600 * 1000
      const dueMs = cfg.timeoutHours ? Number(cfg.timeoutHours) * 3600 * 1000 : Infinity
      if (elapsedMs >= remindMs && elapsedMs < dueMs) {
        sendToUser(task.approverId, 'workflow-remind', {
          taskId: task.id,
          instanceId: instance.id,
          title: instance.title,
          message: '审批即将超时，请尽快处理',
        })
        task.remindedAt = now
        await task.save()
        reminded++
        continue
      }
    }

    // 已超时（超过 dueAt）
    const isOverdue = task.dueAt ? new Date(task.dueAt).getTime() <= now.getTime() : false
    if (!isOverdue) continue

    // 超时自动通过
    if (cfg.timeoutAction === 'auto_approve' && task.approverId) {
      const engine = new WorkflowEngine()
      await engine.resumeAfterApproval(instance, task.nodeKey, task.approverId, 'approved')
      autoApproved++
      continue
    }

    // 超时升级转交
    if (cfg.escalateTo && !task.escalated && task.approverId) {
      const target = await resolveEscalateTarget(task.approverId, cfg.escalateTo as EscalateTo)
      if (target && target !== task.approverId) {
        task.approverId = target
        task.escalated = 1
        task.assignedAt = now
        await task.save()
        sendToUser(target, 'workflow-escalate', {
          taskId: task.id,
          instanceId: instance.id,
          title: instance.title,
          message: '审批已超时升级转交给您',
        })
        await WorkflowInstanceLogSafe(instance.id, task.nodeKey, nodeDef?.name || task.nodeKey, target)
        escalated++
        continue
      }
    }

    // 默认：超时催办提醒
    if (task.approverId) {
      sendToUser(task.approverId, 'approval-reminder', {
        taskId: task.id,
        instanceId: instance.id,
        title: instance.title,
        message: '您有一条超时审批任务，请尽快处理',
      })
      task.remindedAt = now
      await task.save()
    }
    reminded++
  }

  if (reminded || autoApproved || escalated) {
    logInfo(`工作流超时任务处理：催办 ${reminded}，自动通过 ${autoApproved}，升级 ${escalated}`)
  }
  return { reminded, autoApproved, escalated }
}

/** 兼容旧调用名 */
export const processOverdueTasks = scanWorkflowTimeouts

let timer: NodeJS.Timeout | null = null
let running = false

/** 启动超时扫描定时器（默认每 60 秒一次） */
export function startTimeoutScanner(intervalMs = 60 * 1000): void {
  if (timer) return
  timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      await scanWorkflowTimeouts()
    } catch (err) {
      logInfo(`工作流超时扫描异常: ${(err as Error).message}`)
    } finally {
      running = false
    }
  }, intervalMs)
  logInfo('工作流超时催办/升级扫描器已启动')
}

export function stopTimeoutScanner(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function safeParse(s: string): NodeConfig {
  try {
    return JSON.parse(s) as NodeConfig
  } catch {
    return {}
  }
}

async function WorkflowInstanceLogSafe(instanceId: number, nodeKey: string, nodeName: string, to: number): Promise<void> {
  try {
    const { default: WorkflowInstanceLog } = await import('../models/WorkflowInstanceLog.js')
    await WorkflowInstanceLog.create({
      instanceId,
      nodeKey,
      nodeName,
      nodeType: 'escalate',
      status: 'success',
      input: '{}',
      output: JSON.stringify({ to }),
      startedAt: new Date(),
      finishedAt: new Date(),
    })
  } catch {
    // 升级日志失败不影响主流程
  }
}

/** 解析升级目标：默认转交当前审批人的直属上级，或指定用户 */
async function resolveEscalateTarget(currentApproverId: number, escalateTo: EscalateTo): Promise<number | null> {
  if (escalateTo?.type === 'user' && escalateTo.userIds?.length) {
    return escalateTo.userIds[0]
  }
  const leaders = await resolveDirectLeader(currentApproverId, 1)
  return leaders[0] ?? null
}
