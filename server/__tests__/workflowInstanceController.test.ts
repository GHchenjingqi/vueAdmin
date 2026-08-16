// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInstanceFindAndCountAll = vi.fn()
const mockInstanceFindByPk = vi.fn()
const mockInstanceUpdate = vi.fn()
const mockLogFindAll = vi.fn()
const mockApprovalFindAll = vi.fn()
const mockApprovalUpdate = vi.fn()

vi.mock('../models/WorkflowInstance.js', () => ({
  default: {
    findAndCountAll: (...args: any[]) => mockInstanceFindAndCountAll(...args),
    findByPk: (...args: any[]) => mockInstanceFindByPk(...args),
    update: (...args: any[]) => mockInstanceUpdate(...args),
  },
}))
vi.mock('../models/WorkflowInstanceLog.js', () => ({ default: { findAll: (...args: any[]) => mockLogFindAll(...args) } }))
vi.mock('../models/ApprovalTask.js', () => ({ default: { findAll: (...args: any[]) => mockApprovalFindAll(...args), update: (...args: any[]) => mockApprovalUpdate(...args) } }))
vi.mock('../models/Workflow.js', () => ({ default: {} }))
vi.mock('../models/WorkflowBinding.js', () => ({ default: {} }))
vi.mock('../models/User.js', () => ({ default: {} }))
vi.mock('../services/WorkflowEngine.js', () => ({ default: class { execute = vi.fn().mockResolvedValue(undefined) } }))
vi.mock('../middleware/errorHandler.js', () => ({ AppError: class extends Error { constructor(public status: number, msg: string) { super(msg) } } }))
vi.mock('../utils/logger.js', () => ({ logOperation: vi.fn() }))

import * as workflowInstanceController from '../controllers/workflowInstanceController.js'

function mockReqRes(query: Record<string, unknown> = {}, params: Record<string, string> = {}, body: Record<string, unknown> = {}) {
  const res: any = { json: vi.fn(), status: vi.fn().mockReturnThis() }
  return [{ query, params, body, user: { id: 1 } } as never, res as never, vi.fn() as never] as const
}

describe('workflowInstanceController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInstanceFindAndCountAll.mockResolvedValue({ rows: [], count: 0 })
    mockInstanceFindByPk.mockResolvedValue(null)
    mockLogFindAll.mockResolvedValue([])
    mockApprovalFindAll.mockResolvedValue([])
    mockApprovalUpdate.mockResolvedValue([1])
    mockInstanceUpdate.mockResolvedValue([1])
  })

  describe('listInstances', () => {
    it('include 流程名与发起人名', async () => {
      const [req, res, next] = mockReqRes({ page: '1', pageSize: '10' })
      await workflowInstanceController.listInstances(req, res, next)
      expect(mockInstanceFindAndCountAll).toHaveBeenCalledTimes(1)
      const arg = mockInstanceFindAndCountAll.mock.calls[0][0]
      const includes = arg.include
      expect(includes).toHaveLength(2)
      expect(includes[0]).toMatchObject({ as: 'workflow', attributes: ['id', 'name'] })
      expect(includes[1]).toMatchObject({ as: 'starter', attributes: ['id', 'username', 'nickname'] })
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0 }))
    })

    it('按 status / bindingKey / bindingId 组装 where', async () => {
      const [req, res, next] = mockReqRes({ status: 'running', bindingKey: 'leave', bindingId: '5' })
      await workflowInstanceController.listInstances(req, res, next)
      const arg = mockInstanceFindAndCountAll.mock.calls[0][0]
      expect(arg.where).toEqual({ status: 'running', bindingKey: 'leave', bindingId: 5 })
    })
  })

  describe('getInstanceDetail', () => {
    it('实例不存在时 next 错误', async () => {
      const [req, res, next] = mockReqRes({}, { id: '1' })
      await workflowInstanceController.getInstanceDetail(req, res, next)
      expect(next).toHaveBeenCalled()
      expect(res.json).not.toHaveBeenCalled()
    })

    it('返回 instance + logs + approvals', async () => {
      mockInstanceFindByPk.mockResolvedValueOnce({ id: 1, status: 'approved' })
      const [req, res, next] = mockReqRes({}, { id: '1' })
      await workflowInstanceController.getInstanceDetail(req, res, next)
      expect(mockLogFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { instanceId: 1 }, order: [['id', 'ASC']] }))
      expect(mockApprovalFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { instanceId: 1 }, order: [['id', 'ASC']] }))
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 0, data: { instance: { id: 1, status: 'approved' }, logs: [], approvals: [] } }),
      )
    })
  })

  describe('retryInstance', () => {
    it('仅 failed/terminated 可重试', async () => {
      mockInstanceFindByPk.mockResolvedValueOnce({ id: 1, status: 'approved', update: vi.fn() })
      const [req, res, next] = mockReqRes({}, { id: '1' })
      await workflowInstanceController.retryInstance(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('重试置 pending 并执行引擎', async () => {
      const update = vi.fn().mockResolvedValue(undefined)
      mockInstanceFindByPk.mockResolvedValueOnce({ id: 1, status: 'failed', update })
      const [req, res, next] = mockReqRes({}, { id: '1' })
      await workflowInstanceController.retryInstance(req, res, next)
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', currentNodeKey: null }))
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, message: '重试已触发' }))
    })
  })

  describe('terminateInstance', () => {
    it('已结束实例不可终止', async () => {
      mockInstanceFindByPk.mockResolvedValueOnce({ id: 1, status: 'approved', update: vi.fn() })
      const [req, res, next] = mockReqRes({}, { id: '1' })
      await workflowInstanceController.terminateInstance(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('终止置 terminated 并取消待办', async () => {
      const update = vi.fn().mockResolvedValue(undefined)
      mockInstanceFindByPk.mockResolvedValueOnce({ id: 1, status: 'running', update })
      const [req, res, next] = mockReqRes({}, { id: '1' })
      await workflowInstanceController.terminateInstance(req, res, next)
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'terminated' }))
      expect(mockApprovalUpdate).toHaveBeenCalledWith(
        { status: 'canceled' },
        { where: { instanceId: 1, status: 'pending' } },
      )
    })
  })
})
