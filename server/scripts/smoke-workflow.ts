/**
 * 工作流引擎真实 DB 冒烟测试（P0–P1 验收）
 *
 * 覆盖：
 *  1) 多步顺序审批续跑（A→B→C 不重复派单、正确推进）
 *  2) AND-join 并行分支汇聚（D 需等 B、C 都完成才触发）
 *  3) 驳回即终止实例，并取消其余 pending 审批任务
 *  4) runtimeState 持久化（JSON 可解析、上下文/完成集合正确）
 *
 * 该脚本只创建以 SMOKE- 前缀的临时数据，结束（含异常）时清理，不污染业务库。
 */
import { Op } from 'sequelize'
import sequelize from '../config/database.js'
import Workflow from '../models/Workflow.js'
import WorkflowVersion from '../models/WorkflowVersion.js'
import WorkflowNode from '../models/WorkflowNode.js'
import WorkflowEdge from '../models/WorkflowEdge.js'
import WorkflowApproverRule from '../models/WorkflowApproverRule.js'
import WorkflowInstance from '../models/WorkflowInstance.js'
import ApprovalTask from '../models/ApprovalTask.js'
import WorkflowEngine from '../services/WorkflowEngine.js'

const APPROVERS = { a1: 9001, b1: 9002, c1: 9003, d1: 9004 }

let passed = 0
let failed = 0
function check(label: string, cond: boolean, extra = '') {
  if (cond) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.log(`  ✗ ${label} ${extra}`)
  }
}

async function buildGraph(workflowId: number, versionId: number) {
  const nodes = [
    { nodeKey: 'start', name: '开始', type: 'start' },
    { nodeKey: 'a1', name: '主管审批', type: 'approve', config: JSON.stringify({ timeoutHours: 24 }) },
    { nodeKey: 'b1', name: '财务审批', type: 'approve' },
    { nodeKey: 'c1', name: '总监审批', type: 'approve' },
    { nodeKey: 'd1', name: '总经理审批', type: 'approve' },
    { nodeKey: 'end', name: '结束', type: 'end' },
  ]
  for (const n of nodes) {
    await WorkflowNode.create({ workflowId, versionId, ...n } as any)
  }
  const edges = [
    ['start', 'a1'],
    ['a1', 'b1'],
    ['a1', 'c1'],
    ['b1', 'd1'],
    ['c1', 'd1'],
    ['d1', 'end'],
  ]
  for (const [s, t] of edges) {
    await WorkflowEdge.create({ workflowId, versionId, sourceNodeKey: s, targetNodeKey: t, conditionType: 'always' } as any)
  }
  for (const [nodeKey, uid] of Object.entries(APPROVERS)) {
    await WorkflowApproverRule.create({
      workflowId,
      versionId,
      nodeKey,
      ruleType: 'user',
      ruleConfig: JSON.stringify({ userIds: [uid] }),
    } as any)
  }
}

async function pendingSet(instanceId: number): Promise<Set<string>> {
  const tasks = await ApprovalTask.findAll({ where: { instanceId, status: 'pending' } })
  return new Set(tasks.map((t) => `${t.nodeKey}:${t.approverId}`))
}

async function approveTask(instanceId: number, nodeKey: string, approverId: number, decision: 'approved' | 'rejected') {
  const task = await ApprovalTask.findOne({ where: { instanceId, nodeKey, approverId, status: 'pending' } })
  if (!task) throw new Error(`找不到 pending 任务 ${nodeKey}/${approverId}`)
  await task.update({ status: decision, finishedAt: new Date() })
  const inst = await WorkflowInstance.findByPk(instanceId)
  if (!inst) throw new Error('实例不存在')
  const engine = new WorkflowEngine()
  await engine.resumeAfterApproval(inst, nodeKey, approverId, decision)
}

async function main() {
  await sequelize.authenticate()
  const workflow = await Workflow.create({ name: 'SMOKE-工作流引擎验收' } as any)
  const version = await WorkflowVersion.create({ workflowId: workflow.id, versionNo: 1, status: 'published' } as any)
  await buildGraph(workflow.id, version.id)

  const createdInstanceIds: number[] = []
  const engine = new WorkflowEngine()

  try {
    // ---------- 场景 1：多步 + AND-join ----------
    console.log('\n[场景1] 多步顺序审批 + AND-join 并行汇聚')
    const inst = await WorkflowInstance.create({
      workflowId: workflow.id,
      versionId: version.id,
      title: 'SMOKE-场景1',
      status: 'pending',
      startedBy: 0,
      input: JSON.stringify({ amount: 100 }),
    } as any)
    createdInstanceIds.push(inst.id)

    await engine.execute(inst)
    let i = await WorkflowInstance.findByPk(inst.id)
    check('执行后实例进入 partial 等待态', i!.status === 'partial', `实际=${i!.status}`)
    check('首节点 a1 派发给 9001', (await pendingSet(inst.id)).has('a1:9001'))
    check('runtimeState 已持久化(JSON)', !!i!.runtimeState && (() => { try { JSON.parse(i!.runtimeState!); return true } catch { return false } })())

    await approveTask(inst.id, 'a1', APPROVERS.a1, 'approved')
    check('a1 通过后并行派发 b1(9002)+c1(9003)', (await pendingSet(inst.id)).has('b1:9002') && (await pendingSet(inst.id)).has('c1:9003'))

    // 只通过 b1，AND-join 不应触发 d1
    await approveTask(inst.id, 'b1', APPROVERS.b1, 'approved')
    check('仅 b1 通过时 d1 未触发(仍等待 c1)', !(await pendingSet(inst.id)).has('d1:9004'))
    i = await WorkflowInstance.findByPk(inst.id)
    const rs1 = JSON.parse(i!.runtimeState!)
    check('AND-join 前驱集合记录 b1', (rs1.predecessorsDone['d1'] || []).includes('b1'))

    // 通过 c1，AND-join 满足 → d1 触发
    await approveTask(inst.id, 'c1', APPROVERS.c1, 'approved')
    check('b1、c1 都通过后 d1(9004) 触发', (await pendingSet(inst.id)).has('d1:9004'))

    await approveTask(inst.id, 'd1', APPROVERS.d1, 'approved')
    i = await WorkflowInstance.findByPk(inst.id)
    check('全链路通过 → 实例 approved', i!.status === 'approved', `实际=${i!.status}`)
    check('完成后无 pending 任务', (await pendingSet(inst.id)).size === 0)
    check('runtimeState.finished=true', JSON.parse(i!.runtimeState!).finished === true)

    // ---------- 场景 2：驳回终止 + 取消其余 pending ----------
    console.log('\n[场景2] 驳回终止实例并取消并行 pending 任务')
    const inst2 = await WorkflowInstance.create({
      workflowId: workflow.id,
      versionId: version.id,
      title: 'SMOKE-场景2',
      status: 'pending',
      startedBy: 0,
      input: JSON.stringify({ amount: 200 }),
    } as any)
    createdInstanceIds.push(inst2.id)

    await engine.execute(inst2)
    await approveTask(inst2.id, 'a1', APPROVERS.a1, 'approved')
    check('a1 通过后 b1、c1 并行 pending', (await pendingSet(inst2.id)).has('b1:9002') && (await pendingSet(inst2.id)).has('c1:9003'))

    // 在 b1 处驳回 → 实例终止，c1 应被取消
    await approveTask(inst2.id, 'b1', APPROVERS.b1, 'rejected')
    const i2 = await WorkflowInstance.findByPk(inst2.id)
    check('驳回后实例状态 rejected', i2!.status === 'rejected', `实际=${i2!.status}`)
    const canceled = await ApprovalTask.findAll({ where: { instanceId: inst2.id, status: 'canceled' } })
    check('并行 pending 的 c1 被取消', canceled.some((t) => t.nodeKey === 'c1' && t.approverId === APPROVERS.c1))
    check('rejected 的 b1 任务状态为 rejected', (await ApprovalTask.findOne({ where: { instanceId: inst2.id, nodeKey: 'b1' } }))!.status === 'rejected')
  } finally {
    // ---------- 清理 ----------
    console.log('\n[清理] 删除 SMOKE 临时数据')
    await ApprovalTask.destroy({ where: { instanceId: { [Op.in]: createdInstanceIds } } })
    await WorkflowInstance.destroy({ where: { id: { [Op.in]: createdInstanceIds } } })
    await WorkflowApproverRule.destroy({ where: { versionId: version.id } })
    await WorkflowEdge.destroy({ where: { versionId: version.id } })
    await WorkflowNode.destroy({ where: { versionId: version.id } })
    await WorkflowVersion.destroy({ where: { id: version.id } })
    await Workflow.destroy({ where: { id: workflow.id } })
    console.log('✓ 清理完成')
  }

  console.log(`\n==== 冒烟结果: 通过 ${passed}, 失败 ${failed} ====`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('❌ 冒烟测试异常:', err)
  process.exit(1)
})
