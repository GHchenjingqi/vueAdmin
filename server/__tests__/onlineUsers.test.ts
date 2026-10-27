import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockVerify, mockSendToUser } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockSendToUser: vi.fn(),
}))

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: mockVerify,
  },
}))

vi.mock('../config/index.js', () => ({
  default: {
    jwt: {
      secret: 'test-secret',
    },
    redis: {
      enabled: false,
    },
  },
}))

vi.mock('../utils/sseManager.js', () => ({
  sendToUser: mockSendToUser,
}))

import {
  addOnlineUser,
  removeOnlineUser,
  removeOnlineUserBySocket,
  updateUserActivity,
  getOnlineUsers,
  getOnlineCount,
  isUserOnline,
  isUserKicked,
  forceLogout,
  clearKickRecord,
  clearAllOnlineUsers,
} from '../utils/onlineUsers.js'

describe('onlineUsers', () => {
  const TID = 1

  beforeEach(() => {
    mockVerify.mockReset()
    mockSendToUser.mockReset()
    clearAllOnlineUsers()
  })

  describe('addOnlineUser', () => {
    it('token 有效时添加用户', () => {
      mockVerify.mockReturnValue({
        id: 1,
        username: 'admin',
        nickname: 'Admin',
        tenantId: 1,
        iat: Math.floor(Date.now() / 1000),
      })

      addOnlineUser('valid-token', 'socket-1')

      expect(getOnlineCount()).toBe(1)
      expect(isUserOnline(TID, 1)).toBe(true)
    })

    it('token 无效时忽略', () => {
      mockVerify.mockImplementation(() => {
        throw new Error('invalid token')
      })

      addOnlineUser('invalid-token', 'socket-1')

      expect(getOnlineCount()).toBe(0)
    })

    it('无 nickname 时使用 username', () => {
      mockVerify.mockReturnValue({
        id: 3,
        username: 'user3',
        tenantId: 1,
        iat: Math.floor(Date.now() / 1000),
      })

      addOnlineUser('token', 'socket-2')

      const users = getOnlineUsers()
      expect(users[0].nickname).toBe('user3')
    })
  })

  describe('removeOnlineUser', () => {
    it('移除指定用户', () => {
      mockVerify.mockReturnValue({ id: 1, username: 'admin', tenantId: 1, iat: 1 })
      addOnlineUser('token', 'socket-1')

      removeOnlineUser(TID, 1)

      expect(isUserOnline(TID, 1)).toBe(false)
    })

    it('移除不存在的用户不报错', () => {
      expect(() => removeOnlineUser(TID, 999)).not.toThrow()
    })
  })

  describe('removeOnlineUserBySocket', () => {
    it('通过 socketId 移除用户', () => {
      mockVerify.mockReturnValue({ id: 1, username: 'a', tenantId: 1, iat: 1 })
      addOnlineUser('token1', 'sock-a')

      const count1 = getOnlineCount()
      expect(count1).toBe(1)

      removeOnlineUserBySocket('sock-a')

      expect(isUserOnline(TID, 1)).toBe(false)
      expect(getOnlineCount()).toBe(0)
    })

    it('socketId 不存在时不报错', () => {
      expect(() => removeOnlineUserBySocket('nonexistent')).not.toThrow()
    })
  })

  describe('updateUserActivity', () => {
    it('更新已存在用户的活动时间', () => {
      mockVerify.mockReturnValue({ id: 1, username: 'admin', tenantId: 1, iat: 1 })
      addOnlineUser('token', 'socket-1')

      updateUserActivity(1, '10.0.0.1', 'Chrome', { tenantId: 1 })

      const users = getOnlineUsers()
      expect(users[0].ip).toBe('10.0.0.1')
      expect(users[0].userAgent).toBe('Chrome')
    })

    it('用户不存在时创建新记录', () => {
      updateUserActivity(5, '10.0.0.5', 'Firefox', { username: 'user5', nickname: 'U5', tenantId: 1 })

      expect(isUserOnline(TID, 5)).toBe(true)
      const users = getOnlineUsers()
      expect(users[0].username).toBe('user5')
    })
  })

  describe('getOnlineUsers', () => {
    it('返回在线用户列表', () => {
      mockVerify.mockReturnValue({ id: 1, username: 'a', tenantId: 1, iat: 1 })
      addOnlineUser('t1', 's1')

      const users = getOnlineUsers()
      expect(users).toHaveLength(1)
      expect(users[0]).toHaveProperty('userId')
      expect(users[0]).toHaveProperty('lastActiveTime')
    })

    it('无在线用户时返回空数组', () => {
      expect(getOnlineUsers()).toEqual([])
    })

    it('按 tenantId 过滤', () => {
      mockVerify.mockReturnValue({ id: 1, username: 'a', tenantId: 1, iat: 1 })
      addOnlineUser('t1', 's1')
      mockVerify.mockReturnValue({ id: 2, username: 'b', tenantId: 2, iat: 1 })
      addOnlineUser('t2', 's2')

      expect(getOnlineUsers(1)).toHaveLength(1)
    })
  })

  describe('getOnlineCount', () => {
    it('返回在线用户数', () => {
      mockVerify.mockReturnValue({ id: 1, username: 'a', tenantId: 1, iat: 1 })
      addOnlineUser('t1', 's1')

      expect(getOnlineCount()).toBe(1)
    })

    it('按 tenantId 统计', () => {
      mockVerify.mockReturnValue({ id: 1, username: 'a', tenantId: 1, iat: 1 })
      addOnlineUser('t1', 's1')
      mockVerify.mockReturnValue({ id: 2, username: 'b', tenantId: 2, iat: 1 })
      addOnlineUser('t2', 's2')

      expect(getOnlineCount(1)).toBe(1)
      expect(getOnlineCount(2)).toBe(1)
    })
  })

  describe('isUserOnline', () => {
    it('用户在线返回 true', () => {
      mockVerify.mockReturnValue({ id: 1, username: 'a', tenantId: 1, iat: 1 })
      addOnlineUser('t1', 's1')

      expect(isUserOnline(TID, 1)).toBe(true)
    })

    it('用户不在线返回 false', () => {
      expect(isUserOnline(TID, 999)).toBe(false)
    })
  })

  describe('isUserKicked', () => {
    it('未被踢返回 false', () => {
      expect(isUserKicked(TID, 999, 1)).toBe(false)
    })

    it('被踢后 token 签发时间早于踢出时间返回 true', () => {
      forceLogout(TID, 1, { reason: 'test' })

      const result = isUserKicked(TID, 1, 1)
      expect(result).toBe(true)
    })

    it('无 iat 时返回 true', () => {
      forceLogout(TID, 1, { reason: 'test' })

      const result = isUserKicked(TID, 1, undefined)
      expect(result).toBe(true)
    })
  })

  describe('forceLogout', () => {
    it('强制用户下线并推送通知', () => {
      forceLogout(TID, 1, { reason: '违规操作', operatorName: 'admin' })

      expect(mockSendToUser).toHaveBeenCalledWith(
        1,
        'kicked',
        expect.objectContaining({
          userId: 1,
          reason: '违规操作',
          operatorName: 'admin',
        }),
      )
    })

    it('不传 extra 时使用默认值', () => {
      forceLogout(TID, 1)

      expect(mockSendToUser).toHaveBeenCalledWith(
        1,
        'kicked',
        expect.objectContaining({
          reason: '您的账号已被管理员强制下线，请重新登录',
          operatorName: null,
        }),
      )
    })

    it('sendToUser 抛异常时不中断', () => {
      mockSendToUser.mockImplementation(() => {
        throw new Error('SSE error')
      })

      expect(() => forceLogout(TID, 1)).not.toThrow()
    })
  })

  describe('clearKickRecord', () => {
    it('清除踢出记录', () => {
      forceLogout(TID, 1, { reason: 'test' })
      expect(isUserKicked(TID, 1, 1)).toBe(true)

      clearKickRecord(TID, 1)

      expect(isUserKicked(TID, 1, 1)).toBe(false)
    })
  })
})
