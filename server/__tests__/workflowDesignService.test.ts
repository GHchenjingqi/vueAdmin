// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockWorkflowFindByPk = vi.fn()
const mockNodeUpsert = vi.fn()
const mockNodeDestroy = vi.fn()
const mockEdgeUpsert = vi.fn()
const mockEdgeDestroy = vi.fn()
const mockRuleUpsert = vi.fn()
const mockRuleDestroy = vi.fn()

vi.mock('../models/Workflow.js', () => ({ default: { findByPk: (...args: any[]) => mockWorkflowFindByPk(...args) } }))
vi.mock('../models/WorkflowNode.js', () => ({ default: { upsert: (...args: any[]) => mockNodeUpsert(...args), destroy: (...args: any[]) => mockNodeDestroy(...args) } }))
vi.mock('../models/WorkflowEdge.js', () => ({ default: { upsert: (...args: any[]) => mockEdgeUpsert(...args), destroy: (...args: any[]) => mockEdgeDestroy(...args) } }))
vi.mock('../models/WorkflowApproverRule.js', () => ({ default: { upsert: (...args: any[]) => mockRuleUpsert(...args), destroy: (...args: any[]) => mockRuleDestroy(...args) } }))

import * as workflowDesignService from '../services/workflowDesignService.js'

describe('workflowDesignService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkflowFindByPk.mockResolvedValue({ id: 1, draftVersionId: 10 })
    mockNodeUpsert.mockResolvedValue([{}, true])
    mockEdgeUpsert.mockResolvedValue([{}, true])
    mockRuleUpsert.mockResolvedValue([{}, true])
    mockNodeDestroy.mockResolvedValue(undefined)
    mockEdgeDestroy.mockResolvedValue(undefined)
    mockRuleDestroy.mockResolvedValue(undefined)
  })

  describe('upsertNode', () => {
    it('使用草稿版本 upsert 节点', async () => {
      await workflowDesignService.upsertNode(1, { nodeKey: 'start-1', name: '开始', type: 'start' })
      expect(mockNodeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ workflowId: 1, versionId: 10, nodeKey: 'start-1', type: 'start' }),
      )
    })

    it('notify 节点 config 透传', async () => {
      await workflowDesignService.upsertNode(1, {
        nodeKey: 'notify-1',
        name: '通知',
        type: 'notify',
        config: '{"title":"标题"}',
      })
      expect(mockNodeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ config: '{"title":"标题"}' }),
      )
    })
  })

  describe('deleteNode', () => {
    it('级联删除节点本身、相关边与审批人规则', async () => {
      await workflowDesignService.deleteNode(1, 'approve-1')
      // 节点删除
      expect(mockNodeDestroy).toHaveBeenCalledWith(expect.objectContaining({ where: { versionId: 10, nodeKey: 'approve-1' } }))
      // 以该节点为源的边删除
      expect(mockEdgeDestroy).toHaveBeenCalledWith(expect.objectContaining({ where: { versionId: 10, sourceNodeKey: 'approve-1' } }))
      // 以该节点为目标的边删除
      expect(mockEdgeDestroy).toHaveBeenCalledWith(expect.objectContaining({ where: { versionId: 10, targetNodeKey: 'approve-1' } }))
      // 审批人规则删除
      expect(mockRuleDestroy).toHaveBeenCalledWith(expect.objectContaining({ where: { versionId: 10, nodeKey: 'approve-1' } }))
    })
  })

  describe('upsertEdge', () => {
    it('持久化 sourceHandle（条件真分支）', async () => {
      await workflowDesignService.upsertEdge(1, {
        sourceNodeKey: 'cond-1',
        targetNodeKey: 'end-1',
        sourceHandle: 'true',
        conditionType: 'expression',
        conditionExpr: 'amount > 1000',
      })
      expect(mockEdgeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          workflowId: 1,
          versionId: 10,
          sourceNodeKey: 'cond-1',
          targetNodeKey: 'end-1',
          sourceHandle: 'true',
          conditionType: 'expression',
          conditionExpr: 'amount > 1000',
        }),
      )
    })

    it('普通边 sourceHandle 落库为 null', async () => {
      await workflowDesignService.upsertEdge(1, {
        sourceNodeKey: 'start-1',
        targetNodeKey: 'end-1',
        conditionType: 'always',
      })
      expect(mockEdgeUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ sourceHandle: null, conditionType: 'always' }),
      )
    })
  })

  describe('deleteEdge', () => {
    it('按 versionId + source + target 删除', async () => {
      await workflowDesignService.deleteEdge(1, 'cond-1', 'end-1')
      expect(mockEdgeDestroy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { versionId: 10, sourceNodeKey: 'cond-1', targetNodeKey: 'end-1' } }),
      )
    })
  })

  describe('upsertApproverRule / deleteApproverRule', () => {
    it('upsert 携带 nodeKey 与 versionId', async () => {
      await workflowDesignService.upsertApproverRule(1, 'approve-1', {
        ruleType: 'user',
        ruleConfig: '{"userIds":[1]}',
        sort: 0,
      })
      expect(mockRuleUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ versionId: 10, nodeKey: 'approve-1', ruleType: 'user', sort: 0 }),
      )
    })

    it('delete 按 ruleId + versionId 删除', async () => {
      await workflowDesignService.deleteApproverRule(1, 42)
      expect(mockRuleDestroy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 42, versionId: 10 } }),
      )
    })
  })
})
