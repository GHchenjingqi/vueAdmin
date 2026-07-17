import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSchedule, mockValidate, mockStop } = vi.hoisted(() => {
  const mockStop = vi.fn()
  return {
    mockSchedule: vi.fn().mockReturnValue({ stop: mockStop }),
    mockValidate: vi.fn(),
    mockStop,
  }
})

const { mockTaskFindAll, mockTaskFindByPk, mockTaskUpdate } = vi.hoisted(() => ({
  mockTaskFindAll: vi.fn(),
  mockTaskFindByPk: vi.fn(),
  mockTaskUpdate: vi.fn(),
}))

const { mockLogDestroy } = vi.hoisted(() => ({
  mockLogDestroy: vi.fn(),
}))

vi.mock('node-cron', () => ({
  default: {
    schedule: mockSchedule,
    validate: mockValidate,
  },
}))

vi.mock('../models/Task.js', () => ({
  default: {
    findAll: mockTaskFindAll,
    findByPk: mockTaskFindByPk,
    update: mockTaskUpdate,
  },
}))

vi.mock('../models/Log.js', () => ({
  default: {
    destroy: mockLogDestroy,
  },
}))

vi.mock('sequelize', () => ({
  Op: { lt: Symbol('lt') },
}))

vi.mock('../utils/fileLogger.js', () => ({
  logInfo: vi.fn(),
}))

import {
  initScheduler,
  reloadTask,
  runTaskNow,
  getRunningTasks,
} from '../utils/scheduler'

describe('scheduler', () => {
  beforeEach(() => {
    mockSchedule.mockClear()
    mockValidate.mockClear()
    mockStop.mockClear()
    mockTaskFindAll.mockClear()
    mockTaskFindByPk.mockClear()
    mockTaskUpdate.mockClear()
    mockLogDestroy.mockClear()
  })

  describe('getRunningTasks', () => {
    it('初始返回空数组', () => {
      expect(getRunningTasks()).toEqual([])
    })
  })

  describe('initScheduler', () => {
    it('初始化所有状态为启用的任务', async () => {
      mockTaskFindAll.mockResolvedValueOnce([
        { id: 1, name: 'cleanup', status: 1, cronExpression: '0 0 * * *', handler: 'cleanupLogs' },
        { id: 2, name: 'disabled', status: 0, cronExpression: '* * * * *', handler: 'heartbeat' },
      ])
      mockValidate.mockReturnValue(true)

      await initScheduler()

      expect(mockSchedule).toHaveBeenCalledTimes(1)
      expect(mockSchedule).toHaveBeenCalledWith('0 0 * * *', expect.any(Function))
    })

    it('cron 表达式无效时不调度', async () => {
      mockTaskFindAll.mockResolvedValueOnce([
        { id: 1, name: 'invalid', status: 1, cronExpression: 'invalid', handler: 'cleanupLogs' },
      ])
      mockValidate.mockReturnValue(false)

      await initScheduler()

      expect(mockSchedule).not.toHaveBeenCalled()
    })

    it('无任务时正常完成', async () => {
      mockTaskFindAll.mockResolvedValueOnce([])

      await initScheduler()

      expect(mockSchedule).not.toHaveBeenCalled()
    })
  })

  describe('reloadTask', () => {
    it('任务启用时启动调度', async () => {
      mockTaskFindByPk.mockResolvedValueOnce({
        id: 1, name: 'cleanup', status: 1, cronExpression: '0 0 * * *', handler: 'cleanupLogs',
      })
      mockValidate.mockReturnValue(true)

      await reloadTask(1)

      expect(mockSchedule).toHaveBeenCalledTimes(1)
    })

    it('任务禁用时停止调度', async () => {
      mockTaskFindByPk.mockResolvedValueOnce({
        id: 1, name: 'cleanup', status: 0, cronExpression: '0 0 * * *', handler: 'cleanupLogs',
      })

      await reloadTask(1)

      expect(mockSchedule).not.toHaveBeenCalled()
    })

    it('任务不存在时直接返回', async () => {
      mockTaskFindByPk.mockResolvedValueOnce(null)

      await reloadTask(999)

      expect(mockSchedule).not.toHaveBeenCalled()
    })
  })

  describe('runTaskNow', () => {
    it('执行已知 handler 的任务', async () => {
      mockTaskFindByPk.mockResolvedValueOnce({
        id: 1, name: 'heartbeat', handler: 'heartbeat',
      })

      await runTaskNow(1)

      expect(mockTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ lastResult: '心跳检测正常' }),
        { where: { id: 1 } },
      )
    })

    it('未知 handler 时记录错误', async () => {
      mockTaskFindByPk.mockResolvedValueOnce({
        id: 1, name: 'unknown', handler: 'noSuchHandler',
      })

      await runTaskNow(1)

      expect(mockTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ lastResult: '未知的处理函数' }),
        { where: { id: 1 } },
      )
    })

    it('handler 执行失败时记录错误', async () => {
      mockLogDestroy.mockRejectedValueOnce(new Error('DB error'))
      mockTaskFindByPk.mockResolvedValueOnce({
        id: 1, name: 'cleanup', handler: 'cleanupLogs',
      })

      await runTaskNow(1)

      expect(mockTaskUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ lastResult: expect.stringContaining('执行失败') }),
        { where: { id: 1 } },
      )
    })

    it('任务不存在时直接返回', async () => {
      mockTaskFindByPk.mockResolvedValueOnce(null)

      await runTaskNow(999)

      expect(mockTaskUpdate).not.toHaveBeenCalled()
    })
  })
})