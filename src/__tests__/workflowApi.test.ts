import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockPatch = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/utils/request', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    patch: mockPatch,
    delete: mockDelete,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('workflowApi', () => {
  it('list() calls GET /workflows with params', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.list({ page: 1, pageSize: 10 })
    expect(mockGet).toHaveBeenCalledWith('/workflows', { params: { page: 1, pageSize: 10 } })
  })

  it('list() supports skipCache flag', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.list({ page: 1 }, true)
    expect(mockGet).toHaveBeenCalledWith('/workflows', { params: { page: 1 }, skipCache: true })
  })

  it('getById() calls GET /workflows/:id', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.getById(5)
    expect(mockGet).toHaveBeenCalledWith('/workflows/5')
  })

  it('create() calls POST /workflows', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.create({ name: '请假流程' })
    expect(mockPost).toHaveBeenCalledWith('/workflows', { name: '请假流程' })
  })

  it('update() calls PUT /workflows/:id', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.update(3, { name: '更新' })
    expect(mockPut).toHaveBeenCalledWith('/workflows/3', { name: '更新' })
  })

  it('delete() calls DELETE /workflows/:id', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.delete(7)
    expect(mockDelete).toHaveBeenCalledWith('/workflows/7')
  })

  it('toggle() calls POST /workflows/:id/toggle', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.toggle(2, true)
    expect(mockPost).toHaveBeenCalledWith('/workflows/2/toggle', { enabled: true })
  })

  it('publish() calls POST /workflows/:id/publish', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.publish(9)
    expect(mockPost).toHaveBeenCalledWith('/workflows/9/publish')
  })

  it('getDesign() calls GET /workflows/:id/design', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.getDesign(11)
    expect(mockGet).toHaveBeenCalledWith('/workflows/11/design')
  })

  it('upsertNode() calls POST /workflows/:id/design/nodes', async () => {
    const { workflowApi } = await import('@/api/workflow')
    const node = { nodeKey: 'approve-1', name: '审批', type: 'approve' as const }
    workflowApi.upsertNode(1, node)
    expect(mockPost).toHaveBeenCalledWith('/workflows/1/design/nodes', node)
  })

  it('deleteNode() calls DELETE /workflows/:id/design/nodes/:nodeKey', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.deleteNode(1, 'start-1')
    expect(mockDelete).toHaveBeenCalledWith('/workflows/1/design/nodes/start-1')
  })

  it('upsertEdge() calls POST /workflows/:id/design/edges (含 sourceHandle)', async () => {
    const { workflowApi } = await import('@/api/workflow')
    const edge = { sourceNodeKey: 'cond-1', targetNodeKey: 'end-1', sourceHandle: 'true', conditionType: 'expression' as const, conditionExpr: 'amount > 1000' }
    workflowApi.upsertEdge(1, edge)
    expect(mockPost).toHaveBeenCalledWith('/workflows/1/design/edges', edge)
  })

  it('deleteEdge() calls DELETE /workflows/:id/design/edges/:sourceKey/:targetKey', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.deleteEdge(1, 'cond-1', 'end-1')
    expect(mockDelete).toHaveBeenCalledWith('/workflows/1/design/edges/cond-1/end-1')
  })

  it('upsertApproverRule() calls POST /workflows/:id/design/approver-rules/:nodeKey', async () => {
    const { workflowApi } = await import('@/api/workflow')
    const rule = { nodeKey: 'approve-1', ruleType: 'user' as const, ruleConfig: '{"userIds":[1]}', sort: 0 }
    workflowApi.upsertApproverRule(1, 'approve-1', rule)
    expect(mockPost).toHaveBeenCalledWith('/workflows/1/design/approver-rules/approve-1', rule)
  })

  it('deleteApproverRule() calls DELETE /workflows/:id/design/approver-rules/:ruleId', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.deleteApproverRule(1, 42)
    expect(mockDelete).toHaveBeenCalledWith('/workflows/1/design/approver-rules/42')
  })

  it('getInstances() calls GET /workflow-instances', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.getInstances({ page: 1, pageSize: 10 })
    expect(mockGet).toHaveBeenCalledWith('/workflow-instances', { params: { page: 1, pageSize: 10 } })
  })

  it('getInstanceDetail() calls GET /workflow-instances/:id', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.getInstanceDetail(3)
    expect(mockGet).toHaveBeenCalledWith('/workflow-instances/3')
  })

  it('retryInstance() calls POST /workflow-instances/:id/retry', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.retryInstance(4)
    expect(mockPost).toHaveBeenCalledWith('/workflow-instances/4/retry')
  })

  it('terminateInstance() calls POST /workflow-instances/:id/terminate', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.terminateInstance(4)
    expect(mockPost).toHaveBeenCalledWith('/workflow-instances/4/terminate')
  })

  it('trigger() calls POST /workflow/trigger', async () => {
    const { workflowApi } = await import('@/api/workflow')
    const data = { bindingKey: 'leave', bindingId: 1 }
    workflowApi.trigger(data)
    expect(mockPost).toHaveBeenCalledWith('/workflow/trigger', data)
  })

  it('getApprovalTasks() calls GET /approval-tasks', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.getApprovalTasks({ status: 'pending', page: 1, pageSize: 10 })
    expect(mockGet).toHaveBeenCalledWith('/approval-tasks', { params: { status: 'pending', page: 1, pageSize: 10 } })
  })

  it('getApprovalTasks() 支持已办多状态过滤', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.getApprovalTasks({ status: 'approved,rejected', page: 1, pageSize: 10 })
    expect(mockGet).toHaveBeenCalledWith('/approval-tasks', { params: { status: 'approved,rejected', page: 1, pageSize: 10 } })
  })

  it('approveTask() calls PATCH /approval-tasks/:id', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.approveTask(8, 'approved', '同意')
    expect(mockPatch).toHaveBeenCalledWith('/approval-tasks/8', { status: 'approved', comment: '同意' })
  })

  it('approveTask() comment 为空时传 undefined', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.approveTask(8, 'rejected')
    expect(mockPatch).toHaveBeenCalledWith('/approval-tasks/8', { status: 'rejected', comment: undefined })
  })

  it('getBindings() calls GET /workflow-bindings', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.getBindings()
    expect(mockGet).toHaveBeenCalledWith('/workflow-bindings')
  })

  it('createBinding() calls POST /workflow-bindings', async () => {
    const { workflowApi } = await import('@/api/workflow')
    const data = { workflowId: 1, bindingKey: 'leave' }
    workflowApi.createBinding(data)
    expect(mockPost).toHaveBeenCalledWith('/workflow-bindings', data)
  })

  it('deleteBinding() calls DELETE /workflow-bindings/:id', async () => {
    const { workflowApi } = await import('@/api/workflow')
    workflowApi.deleteBinding(2)
    expect(mockDelete).toHaveBeenCalledWith('/workflow-bindings/2')
  })
})
