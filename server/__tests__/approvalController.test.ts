// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Op } from 'sequelize'

const mockApprovalFindAndCountAll = vi.fn()
const mockApprovalFindByPk = vi.fn()
const mockInstanceFindByPk = vi.fn()
const mockSendToUser = vi.fn()
const engineExecute = vi.fn()

vi.mock('../models/ApprovalTask.js', () => ({
  default: {
    findAndCountAll: (...args: any[]) => mockApprovalFindAndCountAll(...args),
    findByPk: (...args: any[]) => mockApprovalFindByPk(...args),
  },
}))
vi.mock('../models/WorkflowInstance.js', () => ({ default: { findByPk: (...args: any[]) => mockInstanceFindByPk(...args) } }))
vi.mock('../models/Workflow.js', () => ({ default: {} }))
vi.mock('../models/User.js', () => ({ default: {} }))
vi.mock('../services/WorkflowEngine.js', () => ({ default: class { execute = engineExecute } }))
vi.mock('../middleware/errorHandler.js', () => ({ AppError: class extends Error { constructor(public status: number, msg: string) { super(msg) } } }))
vi.mock('../utils/sseManager.js', () => ({ sendToUser: (...args: any[]) => mockSendToUser(...args) }))
vi.mock('../utils/logger.js', () => ({ logOperation: vi.fn() }))

import * as approvalController from '../controllers/approvalController.js'

function mockReqRes(query: Record<string, unknown> = {}, params: Record<string, string> = {}, body: Record<string, unknown> = {}) {
  const res: any = { json: vi.fn(), status: vi.fn().mockReturnThis() }
  return [{ query, params, body, user: { id: 7, username: 'u', nickname: '张三' } } as never, res as never, vi.fn() as never] as const
}

describe('approvalController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApprovalFindAndCountAll.mockResolvedValue({ rows: [], count: 0 })
    mockApprovalFindByPk.mockResolvedValue(null)
    mockInstanceFindByPk.mockResolvedValue(null)
    engineExecute.mockResolvedValue(undefined)
  })

  describe('listMyTasks', () => {
    it('按 approverId 过滤待办（pending）', async () => {
      const [req, res, next] = mockReqRes({ page: '1', pageSize: '10', status: 'pending' })
      await approvalController.listMyTasks(req, res, next)
      const arg = mockApprovalFindAndCountAll.mock.calls[0][0]
      expect(arg.where).toEqual({ approverId: 7, status: 'pending' })
    })

    it('已办多状态使用 Op.in', async () => {
      const [req, res, next] = mockReqRes({ status: 'approved,rejected' })
      await approvalController.listMyTasks(req, res, next)
      const arg = mockApprovalFindAndCountAll.mock.calls[0][0]
      expect(arg.where.status[Op.in]).toEqual(['approved', 'rejected'])
    })

    it('include 实例(含流程名+发起人名)', async () => {
      const [req, res, next] = mockReqRes({})
      await approvalController.listMyTasks(req, res, next)
      const arg = mockApprovalFindAndCountAll.mock.calls[0][0]
      const instanceInclude = arg.include[0]
      expect(instanceInclude).toMatchObject({ as: 'instance' })
      const nested = instanceInclude.include
      expect(nested).toHaveLength(2)
      expect(nested[0]).toMatchObject({ as: 'workflow', attributes: ['id', 'name'] })
      expect(nested[1]).toMatchObject({ as: 'starter', attributes: ['id', 'username', 'nickname'] })
    })
  })

  describe('approve', () => {
    it('任务不存在时 next 错误', async () => {
      const [req, res, next] = mockReqRes({}, { id: '1' }, { status: 'approved' })
      await approvalController.approve(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('已处理任务抛错', async () => {
      mockApprovalFindByPk.mockResolvedValueOnce({ id: 1, status: 'approved', approverId: 7, update: vi.fn() })
      const [req, res, next] = mockReqRes({}, { id: '1' }, { status: 'approved' })
      await approvalController.approve(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('驳回将实例置 rejected 并通知发起人', async () => {
      const taskUpdate = vi.fn().mockResolvedValue(undefined)
      const instanceUpdate = vi.fn().mockResolvedValue(undefined)
      mockApprovalFindByPk.mockResolvedValueOnce({ id: 1, status: 'pending', approverId: 7, instanceId: 5, update: taskUpdate })
      mockInstanceFindByPk.mockResolvedValueOnce({ id: 5, startedBy: 9, update: instanceUpdate })
      const [req, res, next] = mockReqRes({}, { id: '1' }, { status: 'rejected', comment: '不同意' })
      await approvalController.approve(req, res, next)
      expect(instanceUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected', currentNodeKey: null }))
      expect(mockSendToUser).toHaveBeenCalledWith(9, 'approval-result', expect.any(Object))
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0 }))
    })

    it('通过触发引擎继续执行', async () => {
      const taskUpdate = vi.fn().mockResolvedValue(undefined)
      mockApprovalFindByPk.mockResolvedValueOnce({ id: 1, status: 'pending', approverId: 7, instanceId: 5, update: taskUpdate })
      mockInstanceFindByPk.mockResolvedValueOnce({ id: 5, startedBy: 9, update: vi.fn() })
      const [req, res, next] = mockReqRes({}, { id: '1' }, { status: 'approved' })
      await approvalController.approve(req, res, next)
      expect(engineExecute).toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, message: '已通过' }))
    })

    it('无权处理抛错（非本人审批）', async () => {
      mockApprovalFindByPk.mockResolvedValueOnce({ id: 1, status: 'pending', approverId: 99, instanceId: 5, update: vi.fn() })
      const [req, res, next] = mockReqRes({}, { id: '1' }, { status: 'approved' })
      await approvalController.approve(req, res, next)
      expect(next).toHaveBeenCalled()
    })
  })
})
