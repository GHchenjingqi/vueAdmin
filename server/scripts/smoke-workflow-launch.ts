/**
 * 低代码工作流「业务接入」端到端冒烟测试：
 *  1) 创建含审批节点的已发布工作流 + 表单字段（业务参数定义）
 *  2) 创建绑定（含 callbackUrl）
 *  3) 触发实例（携带表单参数 input）
 *  4) 审批通过后，断言实例自动流转至 approved/结束
 *  5) 断言 input 已持久化、结束回调已触发
 *
 * 仅创建 SMOKE- 前缀的临时数据，结束（含异常）时清理。
 */
import { Op } from 'sequelize'
import http from 'http'
import sequelize from '../config/database.js'
import Workflow from '../models/Workflow.js'
import WorkflowVersion from '../models/WorkflowVersion.js'
import WorkflowNode from '../models/WorkflowNode.js'
import WorkflowEdge from '../models/WorkflowEdge.js'
import WorkflowApproverRule from '../models/WorkflowApproverRule.js'
import WorkflowBinding from '../models/WorkflowBinding.js'
import WorkflowFormField from '../models/WorkflowFormField.js'
import WorkflowInstance from '../models/WorkflowInstance.js'
import ApprovalTask from '../models/ApprovalTask.js'
import WorkflowEngine from '../services/WorkflowEngine.js'

const APPROVER = 9101
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

async function main() {
  await sequelize.authenticate()

  // 本地回调捕获服务
  const callbacks: any[] = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        callbacks.push(JSON.parse(body))
      } catch {
        /* ignore */
      }
      res.statusCode = 200
      res.end('ok')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const port = (server.address() as any).port
  const callbackUrl = `http://localhost:${port}/cb`

  const workflow = await Workflow.create({ name: 'SMOKE-业务接入验收' } as any)
  const version = await WorkflowVersion.create({ workflowId: workflow.id, versionNo: 1, status: 'published' } as any)

  // 图：start → approve → end
  await WorkflowNode.bulkCreate([
    { workflowId: workflow.id, versionId: version.id, nodeKey: 'start', name: '开始', type: 'start' },
    { workflowId: workflow.id, versionId: version.id, nodeKey: 'approve1', name: '主管审批', type: 'approve', config: JSON.stringify({ timeoutHours: 24 }) },
    { workflowId: workflow.id, versionId: version.id, nodeKey: 'end', name: '结束', type: 'end' },
  ] as any)
  await WorkflowEdge.create({
    workflowId: workflow.id,
    versionId: version.id,
    sourceNodeKey: 'start',
    targetNodeKey: 'approve1',
    conditionType: 'always',
  } as any)
  await WorkflowEdge.create({
    workflowId: workflow.id,
    versionId: version.id,
    sourceNodeKey: 'approve1',
    targetNodeKey: 'end',
    conditionType: 'always',
  } as any)
  await WorkflowApproverRule.create({
    workflowId: workflow.id,
    versionId: version.id,
    nodeKey: 'approve1',
    ruleType: 'user',
    ruleConfig: JSON.stringify({ userIds: [APPROVER] }),
  } as any)

  // 表单字段（业务参数定义）
  await WorkflowFormField.bulkCreate([
    { workflowId: workflow.id, fieldKey: 'amount', label: '金额', type: 'number', required: 1, sort: 0 },
    { workflowId: workflow.id, fieldKey: 'reason', label: '事由', type: 'textarea', required: 1, sort: 1 },
    { workflowId: workflow.id, fieldKey: 'category', label: '类别', type: 'select', required: 0, options: '差旅,采购,其他', sort: 2 },
  ] as any)

  // 绑定（含回调）
  const bindingKey = 'SMOKE-LAUNCH'
  await WorkflowBinding.create({
    workflowId: workflow.id,
    bindingKey,
    entityName: 'manual',
    formKey: 'SMOKE-LAUNCH',
    callbackUrl,
    status: 1,
  } as any)

  const engine = new WorkflowEngine()
  const createdInstanceIds: number[] = []
  const input = { amount: 1234, reason: '测试申请', category: '采购' }

  try {
    console.log('\n[场景] 业务发起 → 自动流转审批 → 结束 + 回调')
    const inst = await WorkflowInstance.create({
      workflowId: workflow.id,
      versionId: version.id,
      bindingKey,
      bindingId: 1,
      title: 'SMOKE-业务接入',
      status: 'pending',
      startedBy: 0,
      input: JSON.stringify(input),
    } as any)
    createdInstanceIds.push(inst.id)

    await engine.execute(inst)
    let i = await WorkflowInstance.findByPk(inst.id)
    check('触发后进入审批等待态(partial)', i!.status === 'partial', `实际=${i!.status}`)
    const pending = await ApprovalTask.findAll({ where: { instanceId: inst.id, status: 'pending' } })
    check(
      '审批节点派发给指定审批人',
      pending.some((t) => t.nodeKey === 'approve1' && t.approverId === APPROVER),
    )

    // 审批通过
    const task = await ApprovalTask.findOne({ where: { instanceId: inst.id, nodeKey: 'approve1', approverId: APPROVER, status: 'pending' } })
    if (!task) throw new Error('找不到 pending 任务')
    await task.update({ status: 'approved', finishedAt: new Date() })
    await engine.resumeAfterApproval(i!, 'approve1', APPROVER, 'approved')

    i = await WorkflowInstance.findByPk(inst.id)
    check('审批通过后实例自动流转至 approved(结束)', i!.status === 'approved', `实际=${i!.status}`)
    check('结束后无 pending 任务', (await ApprovalTask.findAll({ where: { instanceId: inst.id, status: 'pending' } })).length === 0)
    check('runtimeState.finished=true', JSON.parse(i!.runtimeState!).finished === true)

    const storedInput = i!.input ? JSON.parse(i!.input) : null
    check('提交参数(input)已持久化', storedInput && storedInput.amount === 1234 && storedInput.reason === '测试申请' && storedInput.category === '采购')

    // 等待回调（finalize 内 await 已触发；再稍候确保落库）
    await new Promise((r) => setTimeout(r, 200))
    const cb = callbacks.find((c) => c.instanceId === inst.id)
    check('结束回调已触发且状态为 approved', !!cb && cb.status === 'approved', `callbacks=${JSON.stringify(callbacks)}`)
  } finally {
    console.log('\n[清理] 删除 SMOKE 临时数据')
    await ApprovalTask.destroy({ where: { instanceId: { [Op.in]: createdInstanceIds } } })
    await WorkflowInstance.destroy({ where: { id: { [Op.in]: createdInstanceIds } } })
    await WorkflowFormField.destroy({ where: { workflowId: workflow.id } })
    await WorkflowApproverRule.destroy({ where: { versionId: version.id } })
    await WorkflowEdge.destroy({ where: { versionId: version.id } })
    await WorkflowNode.destroy({ where: { versionId: version.id } })
    await WorkflowBinding.destroy({ where: { workflowId: workflow.id } })
    await WorkflowVersion.destroy({ where: { id: version.id } })
    await Workflow.destroy({ where: { id: workflow.id } })
    server.close()
    console.log('✓ 清理完成')
  }

  console.log(`\n==== 业务接入冒烟结果: 通过 ${passed}, 失败 ${failed} ====`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('❌ 冒烟测试异常:', err)
  process.exit(1)
})
