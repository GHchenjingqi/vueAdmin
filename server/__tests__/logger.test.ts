import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn().mockResolvedValue({}),
}))

vi.mock('../models/Log.js', () => ({
  default: {
    create: mockCreate,
  },
}))

import { logLogin, logLoginFailure, logOperation } from '../utils/logger'

describe('logger', () => {
  beforeEach(() => {
    mockCreate.mockClear()
  })

  describe('logLogin', () => {
    it('记录登录成功日志', async () => {
      const user = { id: 1, username: 'admin' }
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } }

      await logLogin(user, req)

      expect(mockCreate).toHaveBeenCalledWith({
        type: 'login',
        userId: 1,
        username: 'admin',
        action: '用户登录',
        details: '登录成功',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      })
    })

    it('Log.create 失败时不抛出异常', async () => {
      mockCreate.mockRejectedValueOnce(new Error('DB error'))
      const user = { id: 1, username: 'admin' }
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } }

      await expect(logLogin(user, req)).resolves.toBeUndefined()
    })
  })

  describe('logLoginFailure', () => {
    it('记录登录失败日志', async () => {
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } }

      await logLoginFailure('admin', '密码错误', req)

      expect(mockCreate).toHaveBeenCalledWith({
        type: 'login',
        username: 'admin',
        action: '登录失败',
        details: '密码错误',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      })
    })

    it('空用户名默认显示未知', async () => {
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } }

      await logLoginFailure('', '密码错误', req)

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ username: '未知' }),
      )
    })

    it('空原因默认显示密码错误', async () => {
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } }

      await logLoginFailure('admin', '', req)

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ details: '密码错误' }),
      )
    })

    it('req 为 undefined 时正常处理', async () => {
      await logLoginFailure('admin', '密码错误', undefined)

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'admin',
          action: '登录失败',
          details: '密码错误',
        }),
      )
    })
  })

  describe('logOperation', () => {
    it('记录操作日志', async () => {
      const req = {
        user: { id: 1, username: 'admin' },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test' },
      }

      await logOperation(req, '创建用户', '用户管理', '{"name":"Alice"}')

      expect(mockCreate).toHaveBeenCalledWith({
        type: 'operation',
        userId: 1,
        username: 'admin',
        action: '创建用户',
        target: '用户管理',
        details: '{"name":"Alice"}',
        ipAddress: '127.0.0.1',
        userAgent: 'test',
      })
    })

    it('无 details 参数时正常记录', async () => {
      const req = {
        user: { id: 1, username: 'admin' },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test' },
      }

      await logOperation(req, '删除用户', '用户管理')

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          action: '删除用户',
          target: '用户管理',
          details: undefined,
        }),
      )
    })

    it('Log.create 失败时不抛出异常', async () => {
      mockCreate.mockRejectedValueOnce(new Error('DB error'))
      const req = {
        user: { id: 1, username: 'admin' },
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test' },
      }

      await expect(logOperation(req, 'test', 'test')).resolves.toBeUndefined()
    })
  })
})