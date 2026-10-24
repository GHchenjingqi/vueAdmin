// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

const mockInstanceFindAndCountAll = vi.fn()
const mockInstanceFindByPk = vi.fn()
const mockInstanceFindOne = vi.fn()
const mockInstanceUpdate = vi.fn()
const mockLogFindAll = vi.fn()
const mockApprovalFindAll = vi.fn()
const mockApprovalUpdate = vi.fn()

vi.mock('../models/WorkflowInstance.js', () => ({
  default: {
    findAndCountAll: (...args: any[]) => mockInstanceFindAndCountAll(...args),
    findByPk: (...args: any[]) => mockInstanceFindByPk(...args),
    findOne: (...args: any[]) => mockInstanceFindOne(...args),
    update: (...args: any[]) => mockInstanceUpdate(...args),
  },
}))
vi.mock('../models/WorkflowInstanceLog.js', () => ({ default: { findAll: (...args: any[]) => mockLogFindAll(...args) } }))
vi.mock('../models/ApprovalTask.js', () => ({
  default: { findAll: (...args: any[]) => mockApprovalFindAll(...args), update: (...args: any[]) => mockApprovalUpdate(...args) },
}))
vi.mock('../models/Workflow.js', () => ({ default: {} }))
vi.mock('../models/WorkflowBinding.js', () => ({ default: {} }))
vi.mock('../models/User.js', () => ({ default: {} }))
vi.mock('../services/WorkflowEngine.js', () => ({
  default: class {
    execute = vi.fn().mockResolvedValue(undefined)
  },
}))
vi.mock('../middleware/errorHandler.js', () => ({
  AppError: class extends Error {
    constructor(
      public status: number,
      msg: string,
    ) {
      super(msg)
    }
  },
}))
vi.mock('../utils/logger.js', () => ({ logOperation: vi.fn() }))

import * as workflowInstanceController from '../controllers/workflowInstanceController.js'
import { runInTenant } from '../modules/tenant/context.js'

function mockReqRes(query: Record<string, unknown> = {}, params: Record<string, string> = {}, body: Record<string, unknown> = {}) {
  const res: any = { json: vi.fn(), status: vi.fn().mockReturnThis() }
  return [{ query, params, body, user: { id: 1 } } as unknown as Request, res as unknown as Response, vi.fn()] as const
}

describe('workflowInstanceController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInstanceFindAndCountAll.mockResolvedValue({ rows: [], count: 0 })
    mockInstanceFindByPk.mockResolvedValue(null)
    mockInstanceFindOne.mockResolvedValue(null)
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
      mockInstanceFindOne.mockResolvedValueOnce({ id: 1, status: 'approved' })
      const [req, res, next] = mockReqRes({}, { id: '1' })
      await workflowInstanceController.getInstanceDetail(req, res, next)
      expect(mockLogFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { instanceId: 1 }, order: [['id', 'ASC']] }))
      expect(mockApprovalFindAll).toHaveBeenCalledWith(expect.objectContaining({ where: { instanceId: 1 }, order: [['id', 'ASC']] }))
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, data: { instance: { id: 1, status: 'approved' }, logs: [], approvals: [] } }))
    })
  })

  describe('retryInstance', () => {
    it('仅 failed/terminated 可重试', async () => {
      mockInstanceFindOne.mockResolvedValueOnce({ id: 1, status: 'approved', update: vi.fn() })
      const [req, res, next] = mockReqRes({}, { id: '1' })
      await workflowInstanceController.retryInstance(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('重试置 pending 并执行引擎', async () => {
      const update = vi.fn().mockResolvedValue(undefined)
      mockInstanceFindOne.mockResolvedValueOnce({ id: 1, status: 'failed', update })
      const [req, res, next] = mockReqRes({}, { id: '1' })
      await workflowInstanceController.retryInstance(req, res, next)
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', currentNodeKey: null }))
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 0, message: '重试已触发' }))
    })
  })

  describe('terminateInstance', () => {
    it('已结束实例不可终止', async () => {
      mockInstanceFindOne.mockResolvedValueOnce({ id: 1, status: 'approved', update: vi.fn() })
      const [req, res, next] = mockReqRes({}, { id: '1' })
      await workflowInstanceController.terminateInstance(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('终止置 terminated 并取消待办', async () => {
      const update = vi.fn().mockResolvedValue(undefined)
      mockInstanceFindOne.mockResolvedValueOnce({ id: 1, status: 'running', update })
      const [req, res, next] = mockReqRes({}, { id: '1' })
      await workflowInstanceController.terminateInstance(req, res, next)
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'terminated' }))
      expect(mockApprovalUpdate).toHaveBeenCalledWith({ status: 'canceled' }, { where: { instanceId: 1, status: 'pending' } })
    })
  })

  describe('租户作用域（M1）', () => {
    it('普通租户：列表 where 注入 tenantId', async () => {
      const [req, res, next] = mockReqRes({ page: '1', pageSize: '10' })
      await runInTenant({ tenantId: 2, userId: 1 }, () => workflowInstanceController.listInstances(req, res, next))
      const arg = mockInstanceFindAndCountAll.mock.calls[0][0]
      expect(arg.where).toMatchObject({ tenantId: 2 })
    })

    it('平台超管（bypass）：列表不注入租户约束', async () => {
      const [req, res, next] = mockReqRes({ page: '1', pageSize: '10' })
      await runInTenant({ tenantId: 2, userId: 1, bypass: true }, () => workflowInstanceController.listInstances(req, res, next))
      const arg = mockInstanceFindAndCountAll.mock.calls[0][0]
      expect(arg.where).not.toHaveProperty('tenantId')
    })

    it('缓存键含租户维度：不同租户同一查询不共用缓存（各查一次库）', async () => {
      const [reqA, resA] = mockReqRes({ page: '1', pageSize: '10' })
      await runInTenant({ tenantId: 2, userId: 1 }, () => workflowInstanceController.listInstances(reqA, resA, vi.fn()))
      const [reqB, resB] = mockReqRes({ page: '1', pageSize: '10' })
      await runInTenant({ tenantId: 3, userId: 1 }, () => workflowInstanceController.listInstances(reqB, resB, vi.fn()))
      expect(mockInstanceFindAndCountAll).toHaveBeenCalledTimes(2)
    })

    it('普通租户：详情/重试/终止按 id + tenantId 查询', async () => {
      const [req, res, next] = mockReqRes({}, { id: '7' })
      await runInTenant({ tenantId: 2, userId: 1 }, () => workflowInstanceController.getInstanceDetail(req, res, next))
      expect(mockInstanceFindOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7, tenantId: 2 } }))
    })

    it('平台超管（bypass）：详情仅按 id 查询', async () => {
      const [req, res, next] = mockReqRes({}, { id: '7' })
      await runInTenant({ tenantId: 2, userId: 1, bypass: true }, () => workflowInstanceController.getInstanceDetail(req, res, next))
      expect(mockInstanceFindOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }))
    })

    it('跨租户实例不可见：findOne 返回 null 时 404', async () => {
      mockInstanceFindOne.mockResolvedValueOnce(null)
      const [req, res, next] = mockReqRes({}, { id: '99' })
      await runInTenant({ tenantId: 2, userId: 1 }, () => workflowInstanceController.retryInstance(req, res, next))
      expect(next).toHaveBeenCalled()
      expect(res.json).not.toHaveBeenCalled()
    })
  })
})
