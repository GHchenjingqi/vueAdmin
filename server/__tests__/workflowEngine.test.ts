import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockNodeFindAll = vi.fn()
const mockEdgeFindAll = vi.fn()
const mockRuleFindAll = vi.fn()
const mockInstanceUpdate = vi.fn()
const mockLogCreate = vi.fn()
const mockLogUpdate = vi.fn()
const mockApprovalCreate = vi.fn()
const mockApprovalCount = vi.fn()
const mockNoticeCreate = vi.fn()

vi.mock('../models/WorkflowNode.js', () => ({ default: { findAll: (...args: any[]) => mockNodeFindAll(...args) } }))
vi.mock('../models/WorkflowEdge.js', () => ({ default: { findAll: (...args: any[]) => mockEdgeFindAll(...args) } }))
vi.mock('../models/WorkflowApproverRule.js', () => ({ default: { findAll: (...args: any[]) => mockRuleFindAll(...args) } }))
vi.mock('../models/WorkflowInstance.js', () => ({ default: { update: (...args: any[]) => mockInstanceUpdate(...args) } }))
vi.mock('../models/WorkflowInstanceLog.js', () => ({ default: { create: (...args: any[]) => mockLogCreate(...args), update: (...args: any[]) => mockLogUpdate(...args) } }))
vi.mock('../models/ApprovalTask.js', () => ({ default: { create: (...args: any[]) => mockApprovalCreate(...args), count: (...args: any[]) => mockApprovalCount(...args) } }))
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
  const self = {
    id: 1,
    workflowId: 1,
    versionId: 1,
    title: '测试流程',
    status: 'pending',
    input: '{"applyAmount":5000}',
    startedBy: 1,
    startedAt: null,
    update: vi.fn((vals: any) => { Object.assign(self, vals) }),
    save: vi.fn(),
  }
  Object.assign(self, overrides)
  return self
}

describe('WorkflowEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInstanceUpdate.mockResolvedValue(undefined)
    mockLogCreate.mockResolvedValue({ id: 1, update: mockLogUpdate, startedAt: new Date() })
    mockLogUpdate.mockResolvedValue(undefined)
    mockApprovalCreate.mockResolvedValue({ id: 1 })
    mockApprovalCount.mockResolvedValue(0)
  })

  it('start -> end 简单流程执行成功', async () => {
    mockNodeFindAll.mockResolvedValue([
      { nodeKey: 'start', name: '开始', type: 'start', config: null },
      { nodeKey: 'end', name: '结束', type: 'end', config: null },
    ])
    mockEdgeFindAll.mockResolvedValue([
      { sourceNodeKey: 'start', targetNodeKey: 'end', conditionType: 'always', conditionExpr: null },
    ])
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
    mockRuleFindAll.mockResolvedValue([
      { nodeKey: 'approve1', ruleType: 'user', ruleConfig: '{"userIds":[99]}' },
    ])

    mockApprovalCount.mockResolvedValue(0)

    const engine = createEngine()
    const instance = makeInstance()
    await engine.execute(instance)

    expect(mockApprovalCreate).toHaveBeenCalled()
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
    mockNodeFindAll.mockResolvedValue([
      { nodeKey: 'end', name: '结束', type: 'end', config: null },
    ])
    mockEdgeFindAll.mockResolvedValue([])
    mockRuleFindAll.mockResolvedValue([])

    const engine = createEngine()
    const instance = makeInstance()
    await engine.execute(instance)

    expect(instance.status).toBe('failed')
  })
})