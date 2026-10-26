/**
 * 工作流增强能力端到端冒烟测试（非手机端优化项）：
 *  A) 阈值自动通过（autoApproveExpr）
 *  B) 字段动态审批人（ruleType='field'）
 *  C) 委托审批（Delegation → 引擎自动转交）
 *  D) 抄送（CC 通知落库）
 *  E) 超时自动升级转交（escalateTo）
 *
 * 仅创建 SMOKE- 前缀的临时数据，结束（含异常）时清理。
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
import WorkflowInstanceLog from '../models/WorkflowInstanceLog.js'
import User from '../models/User.js'
import WorkflowDelegation from '../models/WorkflowDelegation.js'
import WorkflowEngine from '../services/WorkflowEngine.js'
import { resolveDelegation } from '../services/workflowDelegationService.js'
import { scanWorkflowTimeouts } from '../services/workflowTimeoutService.js'

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

interface Wf {
  workflow: Workflow
  version: WorkflowVersion
}

async function buildWorkflow(name: string, approveConfig: Record<string, unknown>, approveRules: { ruleType: string; ruleConfig?: string }[]): Promise<Wf> {
  const workflow = await Workflow.create({ name } as any)
  const version = await WorkflowVersion.create({ workflowId: workflow.id, versionNo: 1, status: 'published' } as any)
  await WorkflowNode.bulkCreate([
    { workflowId: workflow.id, versionId: version.id, nodeKey: 'start', name: '开始', type: 'start' },
    { workflowId: workflow.id, versionId: version.id, nodeKey: 'approve1', name: '审批', type: 'approve', config: JSON.stringify(approveConfig) },
    { workflowId: workflow.id, versionId: version.id, nodeKey: 'end', name: '结束', type: 'end' },
  ] as any)
  await WorkflowEdge.create({ workflowId: workflow.id, versionId: version.id, sourceNodeKey: 'start', targetNodeKey: 'approve1', conditionType: 'always' } as any)
  await WorkflowEdge.create({ workflowId: workflow.id, versionId: version.id, sourceNodeKey: 'approve1', targetNodeKey: 'end', conditionType: 'always' } as any)
  for (const r of approveRules) {
    await WorkflowApproverRule.create({ workflowId: workflow.id, versionId: version.id, nodeKey: 'approve1', ruleType: r.ruleType, ruleConfig: r.ruleConfig } as any)
  }
  return { workflow, version }
}

async function cleanup(ids: number[], wfs: Wf[]) {
  console.log('\n[清理] 删除 SMOKE 临时数据')
  await ApprovalTask.destroy({ where: { instanceId: { [Op.in]: ids } } })
  await WorkflowInstanceLog.destroy({ where: { instanceId: { [Op.in]: ids } } })
  for (const wf of wfs) {
    await WorkflowApproverRule.destroy({ where: { versionId: wf.version.id } })
    await WorkflowEdge.destroy({ where: { versionId: wf.version.id } })
    await WorkflowNode.destroy({ where: { versionId: wf.version.id } })
    await WorkflowVersion.destroy({ where: { id: wf.version.id } })
    await Workflow.destroy({ where: { id: wf.workflow.id } })
  }
  await WorkflowDelegation.destroy({ where: { fromUserId: { [Op.in]: [66001, 66002] } } })
  await User.destroy({ where: { id: { [Op.in]: [66001, 66002, 77001] } } })
  console.log('✓ 清理完成')
}

async function main() {
  await sequelize.authenticate()
  const engine = new WorkflowEngine()
  const instances: number[] = []
  const wfs: Wf[] = []

  // 真实用户（委托需要 toUser 存在）
  await User.create({ id: 66001, username: 'smoke_from', nickname: '委托人', email: 'smoke_from@test.com', status: 1, password: 'x' } as any)
  await User.create({ id: 77001, username: 'smoke_to', nickname: '被委托人', email: 'smoke_to@test.com', status: 1, password: 'x' } as any)

  try {
    // ---------- A) 阈值自动通过 ----------
    console.log('\n[A] 阈值自动通过（金额<5000 自动通过）')
    const wfA = await buildWorkflow('SMOKE-自动通过', { timeoutHours: 24, autoApproveExpr: 'amount < 5000' }, [{ ruleType: 'user', ruleConfig: JSON.stringify({ userIds: [9101] }) }])
    wfs.push(wfA)
    const instA = await WorkflowInstance.create({ workflowId: wfA.workflow.id, versionId: wfA.version.id, bindingKey: 'SMOKE-A', bindingId: 1, title: 'SMOKE-A', status: 'pending', startedBy: 0, input: JSON.stringify({ amount: 100 }) } as any)
    instances.push(instA.id)
    await engine.execute(instA)
    let ia = await WorkflowInstance.findByPk(instA.id)
    check('金额满足条件 → 实例直接 approved(无需人工)', ia!.status === 'approved', `实际=${ia!.status}`)
    check('自动通过无 pending 任务', (await ApprovalTask.findAll({ where: { instanceId: instA.id, status: 'pending' } })).length === 0)
    const autoTask = await ApprovalTask.findOne({ where: { instanceId: instA.id, status: 'approved' } })
    check('生成自动通过的审批轨迹', !!autoTask && /自动通过/.test(autoTask.comment || ''))
    // 反例：金额>=5000 走人工
    const instA2 = await WorkflowInstance.create({ workflowId: wfA.workflow.id, versionId: wfA.version.id, bindingKey: 'SMOKE-A', bindingId: 1, title: 'SMOKE-A2', status: 'pending', startedBy: 0, input: JSON.stringify({ amount: 9000 }) } as any)
    instances.push(instA2.id)
    await engine.execute(instA2)
    let ia2 = await WorkflowInstance.findByPk(instA2.id)
    check('金额超阈值 → 进入审批等待态(partial)', ia2!.status === 'partial', `实际=${ia2!.status}`)

    // ---------- B) 字段动态审批人 ----------
    console.log('\n[B] 字段动态审批人（ruleType=field，从表单字段解析审批人）')
    const wfB = await buildWorkflow('SMOKE-字段审批人', { timeoutHours: 24, ccUserIds: [555] }, [{ ruleType: 'field', ruleConfig: JSON.stringify({ fieldKey: 'approverId', resolve: 'userId' }) }])
    wfs.push(wfB)
    const instB = await WorkflowInstance.create({ workflowId: wfB.workflow.id, versionId: wfB.version.id, bindingKey: 'SMOKE-B', bindingId: 1, title: 'SMOKE-B', status: 'pending', startedBy: 0, input: JSON.stringify({ approverId: 88001 }) } as any)
    instances.push(instB.id)
    await engine.execute(instB)
    const pendingB = await ApprovalTask.findAll({ where: { instanceId: instB.id, status: 'pending' } })
    check('动态解析：审批人取自表单字段 approverId=88001', pendingB.some((t) => t.approverId === 88001))

    // ---------- C) 委托审批 ----------
    console.log('\n[C] 委托审批（66001→77001，引擎自动转交）')
    await WorkflowDelegation.create({ fromUserId: 66001, toUserId: 77001, startAt: new Date(Date.now() - 60000), endAt: null, status: 1 } as any)
    const delegated = await resolveDelegation(66001)
    check('resolveDelegation(66001) === 77001', delegated === 77001, `实际=${delegated}`)
    const instC = await WorkflowInstance.create({ workflowId: wfB.workflow.id, versionId: wfB.version.id, bindingKey: 'SMOKE-B', bindingId: 1, title: 'SMOKE-C', status: 'pending', startedBy: 0, input: JSON.stringify({ approverId: 66001 }) } as any)
    instances.push(instC.id)
    await engine.execute(instC)
    const pendingC = await ApprovalTask.findAll({ where: { instanceId: instC.id, status: 'pending' } })
    check('委托生效：pending 任务落在被委托人 77001', pendingC.some((t) => t.approverId === 77001))
    check('委托溯源：delegatedFrom 记录原始审批人 66001', pendingC.some((t) => t.approverId === 77001 && t.delegatedFrom === 66001))

    // ---------- D) 抄送 ----------
    console.log('\n[D] 抄送（CC 通知落库）')
    const ccLog = await WorkflowInstanceLog.findOne({ where: { instanceId: instB.id, nodeType: 'cc' } })
    check('抄送人 555 收到 CC 通知（生成 cc 日志）', !!ccLog)

    // ---------- E) 超时自动升级 ----------
    console.log('\n[E] 超时自动升级转交（escalateTo 指定人）')
    const wfE = await buildWorkflow('SMOKE-超时升级', { timeoutHours: 1, escalateTo: { type: 'user', userIds: [999] } }, [{ ruleType: 'user', ruleConfig: JSON.stringify({ userIds: [9102] }) }])
    wfs.push(wfE)
    const instE = await WorkflowInstance.create({ workflowId: wfE.workflow.id, versionId: wfE.version.id, bindingKey: 'SMOKE-E', bindingId: 1, title: 'SMOKE-E', status: 'running', startedBy: 0, input: '{}' } as any)
    instances.push(instE.id)
    await ApprovalTask.create({ instanceId: instE.id, nodeKey: 'approve1', title: 'SMOKE-E', status: 'pending', approverId: 9102, assignedAt: new Date(Date.now() - 2 * 3600 * 1000), dueAt: new Date(Date.now() - 3600 * 1000), tenantId: 1 } as any)
    const before = await ApprovalTask.findOne({ where: { instanceId: instE.id, status: 'pending' } })
    check('升级前任务在 9102', !!before && before.approverId === 9102)
    const { escalated } = await scanWorkflowTimeouts()
    const after = await ApprovalTask.findOne({ where: { instanceId: instE.id, status: 'pending' } })
    check('超时扫描触发升级', escalated >= 1 && !!after && after.approverId === 999 && after.escalated === 1, `escalated=${escalated}, after=${JSON.stringify(after?.approverId)}`)

    console.log(`\n==== 增强能力冒烟结果: 通过 ${passed}, 失败 ${failed} ====`)
    await cleanup(instances, wfs)
    process.exit(failed === 0 ? 0 : 1)
  } catch (err) {
    console.error('❌ 冒烟异常:', err)
    await cleanup(instances, wfs)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('❌ 冒烟测试异常:', err)
  process.exit(1)
})
