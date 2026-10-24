import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveApprovers } from '../utils/approvalRuleResolver.js'

const mockNodeFindAll = vi.fn()
const mockEdgeFindAll = vi.fn()
const mockRuleFindAll = vi.fn()
const mockInstanceUpdate = vi.fn()
const mockLogCreate = vi.fn()
const mockLogUpdate = vi.fn()
const mockApprovalCreate = vi.fn()
const mockApprovalBulkCreate = vi.fn()
const mockApprovalFindAll = vi.fn()
const mockApprovalUpdate = vi.fn()
const mockApprovalCount = vi.fn()
const mockNoticeCreate = vi.fn()

vi.mock('../models/WorkflowNode.js', () => ({ default: { findAll: (...args: any[]) => mockNodeFindAll(...args) } }))
vi.mock('../models/WorkflowEdge.js', () => ({ default: { findAll: (...args: any[]) => mockEdgeFindAll(...args) } }))
vi.mock('../models/WorkflowApproverRule.js', () => ({ default: { findAll: (...args: any[]) => mockRuleFindAll(...args) } }))
vi.mock('../models/WorkflowInstance.js', () => ({ default: { update: (...args: any[]) => mockInstanceUpdate(...args) } }))
vi.mock('../models/WorkflowInstanceLog.js', () => ({
  default: { create: (...args: any[]) => mockLogCreate(...args), update: (...args: any[]) => mockLogUpdate(...args) },
}))
vi.mock('../models/ApprovalTask.js', () => ({
    default: {
      create: (...args: any[]) => mockApprovalCreate(...args),
      bulkCreate: (...args: any[]) => mockApprovalBulkCreate(...args),
      findAll: (...args: any[]) => mockApprovalFindAll(...args),
      update: (...args: any[]) => mockApprovalUpdate(...args),
      count: (...args: any[]) => mockApprovalCount(...args),
    },
}))
vi.mock('../models/Notice.js', () => ({ default: { create: (...args: any[]) => mockNoticeCreate(...args) } }))

vi.mock('../utils/approvalRuleResolver.js', () => ({ resolveApprovers: vi.fn().mockResolvedValue([99]) }))
vi.mock('../utils/workflowExpression.js', () => ({ evaluateCondition: vi.fn().mockReturnValue(true) }))
vi.mock('../utils/sseManager.js', () => ({ sendToUser: vi.fn() }))
vi.mock('../utils/fileLogger.js', () => ({ logInfo: vi.fn() }))

import WorkflowEngine from '../services/WorkflowEngine.js'

function createEngine() {
  return new WorkflowEngine()
}

function makeInstance(overrides = {}) {
  const self: any = {
    id: 1,
    workflowId: 1,
    versionId: 1,
    title: '测试流程',
    status: 'pending',
    input: '{"applyAmount":5000}',
    startedBy: 1,
    startedAt: null,
    runtimeState: null,
    update: vi.fn((vals: any) => {
      Object.assign(self, vals)
    }),
    save: vi.fn(async () => {
      // commit() 在 save 前已通过 Object.assign 写入实例字段
      return self
    }),
  }
  Object.assign(self, overrides)
  return self
}

/** 让 resolveApprovers 根据 user 规则里的 userIds 返回审批人 */
function mockResolveByUserIds() {
  ;(resolveApprovers as any).mockImplementation(async (rules: any[]) => {
    const ids: number[] = []
    for (const r of rules) {
      const c = r.ruleConfig ? JSON.parse(r.ruleConfig) : {}
      if (r.ruleType === 'user' && c.userIds) ids.push(...c.userIds)
    }
    return ids
  })
}

describe('WorkflowEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInstanceUpdate.mockResolvedValue(undefined)
    mockLogCreate.mockResolvedValue({ id: 1, update: mockLogUpdate, startedAt: new Date() })
    mockLogUpdate.mockResolvedValue(undefined)
    mockApprovalCreate.mockResolvedValue({ id: 1 })
    mockApprovalBulkCreate.mockResolvedValue([{ id: 1 }])
    mockApprovalFindAll.mockResolvedValue([])
    mockApprovalUpdate.mockResolvedValue(undefined)
    mockApprovalCount.mockResolvedValue(0)
    ;(resolveApprovers as any).mockResolvedValue([99])
  })

  it('start -> end 简单流程执行成功', async () => {
    mockNodeFindAll.mockResolvedValue([
      { nodeKey: 'start', name: '开始', type: 'start', config: null },
      { nodeKey: 'end', name: '结束', type: 'end', config: null },
    ])
    mockEdgeFindAll.mockResolvedValue([{ sourceNodeKey: 'start', targetNodeKey: 'end', conditionType: 'always', conditionExpr: null }])
    mockRuleFindAll.mockResolvedValue([])

    const engine = createEngine()
    const instance = makeInstance()
    await engine.execute(instance)

    expect(instance.status).toBe('approved')
  })

  it('start -> approve -> end 审批流程', async () => {
    mockNodeFindAll.mockResolvedValue([
      { nodeKey: 'start', name: '开始', type: 'start', config: null },
      { nodeKey: 'approve1', name: '审批', type: 'approve', config: null },
      { nodeKey: 'end', name: '结束', type: 'end', config: null },
    ])
    mockEdgeFindAll.mockResolvedValue([
      { sourceNodeKey: 'start', targetNodeKey: 'approve1', conditionType: 'always', conditionExpr: null },
      { sourceNodeKey: 'approve1', targetNodeKey: 'end', conditionType: 'always', conditionExpr: null },
    ])
    mockRuleFindAll.mockResolvedValue([{ nodeKey: 'approve1', ruleType: 'user', ruleConfig: '{"userIds":[99]}' }])

    mockApprovalCount.mockResolvedValue(0)

    const engine = createEngine()
    const instance = makeInstance()
    await engine.execute(instance)

    expect(mockApprovalBulkCreate).toHaveBeenCalled()
    expect(instance.status).toBe('partial')
  })

  it('条件判断根据表达式流转', async () => {
    mockNodeFindAll.mockResolvedValue([
      { nodeKey: 'start', name: '开始', type: 'start', config: null },
      { nodeKey: 'cond', name: '条件', type: 'condition', config: null },
      { nodeKey: 'endA', name: '大于1000', type: 'end', config: null },
      { nodeKey: 'endB', name: '结束', type: 'end', config: null },
    ])
    mockEdgeFindAll.mockResolvedValue([
      { sourceNodeKey: 'start', targetNodeKey: 'cond', conditionType: 'always', conditionExpr: null },
      { sourceNodeKey: 'cond', targetNodeKey: 'endA', conditionType: 'expression', conditionExpr: 'amount > 1000' },
      { sourceNodeKey: 'cond', targetNodeKey: 'endB', conditionType: 'always', conditionExpr: null },
    ])
    mockRuleFindAll.mockResolvedValue([])

    const engine = createEngine()
    const instance = makeInstance()
    await engine.execute(instance)

    expect(mockLogCreate).toHaveBeenCalled()
    expect(instance.status).toBe('approved')
  })

  it('start 节点缺失时标记失败', async () => {
    mockNodeFindAll.mockResolvedValue([{ nodeKey: 'end', name: '结束', type: 'end', config: null }])
    mockEdgeFindAll.mockResolvedValue([])
    mockRuleFindAll.mockResolvedValue([])

    const engine = createEngine()
    const instance = makeInstance()
    await engine.execute(instance)

    expect(instance.status).toBe('failed')
  })

  it('多步顺序审批可逐步推进并最终通过（不重复派单）', async () => {
    mockNodeFindAll.mockResolvedValue([
      { nodeKey: 'start', name: '开始', type: 'start', config: null },
      { nodeKey: 'a', name: '审批A', type: 'approve', config: null },
      { nodeKey: 'b', name: '审批B', type: 'approve', config: null },
      { nodeKey: 'end', name: '结束', type: 'end', config: null },
    ])
    mockEdgeFindAll.mockResolvedValue([
      { sourceNodeKey: 'start', targetNodeKey: 'a', conditionType: 'always', conditionExpr: null },
      { sourceNodeKey: 'a', targetNodeKey: 'b', conditionType: 'always', conditionExpr: null },
      { sourceNodeKey: 'b', targetNodeKey: 'end', conditionType: 'always', conditionExpr: null },
    ])
    mockRuleFindAll.mockResolvedValue([
      { nodeKey: 'a', ruleType: 'user', ruleConfig: '{"userIds":[99]}' },
      { nodeKey: 'b', ruleType: 'user', ruleConfig: '{"userIds":[100]}' },
    ])
    mockResolveByUserIds()
    mockApprovalFindAll.mockResolvedValue([])

    const engine = createEngine()
    const instance = makeInstance()
    await engine.execute(instance)
    expect(instance.status).toBe('partial')
    expect(mockApprovalBulkCreate).toHaveBeenCalledTimes(1) // 仅 A 派单

    // 审批 A 通过：应推进到 B 并为其派单
    await engine.resumeAfterApproval(instance, 'a', 99, 'approved')
    expect(instance.status).toBe('partial') // 仍在等待 B
    expect(mockApprovalBulkCreate).toHaveBeenCalledTimes(2) // B 派单

    // 审批 B 通过：流程结束
    await engine.resumeAfterApproval(instance, 'b', 100, 'approved')
    expect(instance.status).toBe('approved')
  })

  it('并行分支 AND-join：需两路都完成才汇合推进', async () => {
    mockNodeFindAll.mockResolvedValue([
      { nodeKey: 'start', name: '开始', type: 'start', config: null },
      { nodeKey: 'a', name: '审批A', type: 'approve', config: null },
      { nodeKey: 'b', name: '通知B', type: 'notify', config: null },
      { nodeKey: 'c', name: '汇合审批C', type: 'approve', config: null },
      { nodeKey: 'end', name: '结束', type: 'end', config: null },
    ])
    mockEdgeFindAll.mockResolvedValue([
      { sourceNodeKey: 'start', targetNodeKey: 'a', conditionType: 'always', conditionExpr: null },
      { sourceNodeKey: 'start', targetNodeKey: 'b', conditionType: 'always', conditionExpr: null },
      { sourceNodeKey: 'a', targetNodeKey: 'c', conditionType: 'always', conditionExpr: null },
      { sourceNodeKey: 'b', targetNodeKey: 'c', conditionType: 'always', conditionExpr: null },
      { sourceNodeKey: 'c', targetNodeKey: 'end', conditionType: 'always', conditionExpr: null },
    ])
    mockRuleFindAll.mockResolvedValue([
      { nodeKey: 'a', ruleType: 'user', ruleConfig: '{"userIds":[99]}' },
      { nodeKey: 'c', ruleType: 'user', ruleConfig: '{"userIds":[100]}' },
    ])
    mockResolveByUserIds()
    mockApprovalFindAll.mockResolvedValue([])

    const engine = createEngine()
    const instance = makeInstance()
    await engine.execute(instance)
    // start -> a(等待审批) 且 b(通知，完成) -> c 入度=2 仅到 b，故 c 未启动
    expect(instance.status).toBe('partial')
    expect(mockApprovalBulkCreate).toHaveBeenCalledTimes(1) // 仅 a 派单

    // 审批 a 通过：a 完成，c 入度齐 -> 触发 c
    await engine.resumeAfterApproval(instance, 'a', 99, 'approved')
    expect(instance.status).toBe('partial')
    expect(mockApprovalBulkCreate).toHaveBeenCalledTimes(2) // c 派单

    await engine.resumeAfterApproval(instance, 'c', 100, 'approved')
    expect(instance.status).toBe('approved')
  })

  it('任一审批人驳回即终止实例', async () => {
    mockNodeFindAll.mockResolvedValue([
      { nodeKey: 'start', name: '开始', type: 'start', config: null },
      { nodeKey: 'a', name: '审批A', type: 'approve', config: null },
      { nodeKey: 'end', name: '结束', type: 'end', config: null },
    ])
    mockEdgeFindAll.mockResolvedValue([
      { sourceNodeKey: 'start', targetNodeKey: 'a', conditionType: 'always', conditionExpr: null },
      { sourceNodeKey: 'a', targetNodeKey: 'end', conditionType: 'always', conditionExpr: null },
    ])
    mockRuleFindAll.mockResolvedValue([{ nodeKey: 'a', ruleType: 'user', ruleConfig: '{"userIds":[99]}' }])
    mockApprovalFindAll.mockResolvedValue([])

    const engine = createEngine()
    const instance = makeInstance()
    await engine.execute(instance)
    expect(instance.status).toBe('partial')

    await engine.resumeAfterApproval(instance, 'a', 99, 'rejected')
    expect(instance.status).toBe('rejected')
    expect(mockApprovalUpdate).toHaveBeenCalled()
  })

  it('审批任务去重：重复 resume 同一节点不重复派单', async () => {
    mockNodeFindAll.mockResolvedValue([
      { nodeKey: 'start', name: '开始', type: 'start', config: null },
      { nodeKey: 'a', name: '审批A', type: 'approve', config: null },
      { nodeKey: 'end', name: '结束', type: 'end', config: null },
    ])
    mockEdgeFindAll.mockResolvedValue([
      { sourceNodeKey: 'start', targetNodeKey: 'a', conditionType: 'always', conditionExpr: null },
      { sourceNodeKey: 'a', targetNodeKey: 'end', conditionType: 'always', conditionExpr: null },
    ])
    // 两个审批人
    mockRuleFindAll.mockResolvedValue([{ nodeKey: 'a', ruleType: 'user', ruleConfig: '{"userIds":[99,100]}' }])
    mockResolveByUserIds()
    mockApprovalFindAll.mockResolvedValue([])

    const engine = createEngine()
    const instance = makeInstance()
    await engine.execute(instance)
    expect(mockApprovalBulkCreate).toHaveBeenCalledTimes(1) // 一次批量派单
    expect((mockApprovalBulkCreate.mock.calls[0] as any)[0]).toHaveLength(2) // 99 与 100 合一单批

    // 重复提交 99 的审批
    await engine.resumeAfterApproval(instance, 'a', 99, 'approved')
    expect(mockApprovalBulkCreate).toHaveBeenCalledTimes(1) // 不应新增派单

    await engine.resumeAfterApproval(instance, 'a', 99, 'approved') // 再次幂等
    expect(mockApprovalBulkCreate).toHaveBeenCalledTimes(1)

    await engine.resumeAfterApproval(instance, 'a', 100, 'approved')
    expect(instance.status).toBe('approved')
  })
})
