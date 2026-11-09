import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addClient, sendToUser, broadcast, getOnlineCount } from '../utils/sseManager.js'

const mockRes = () => {
  const listeners: Record<string, (...args: unknown[]) => void> = {}
  return {
    write: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = cb
    }),
    triggerClose: () => {
      if (listeners['close']) listeners['close']()
    },
  }
}

describe('sseManager', () => {
  beforeEach(() => {
    broadcast('_cleanup', {})
  })

  describe('addClient', () => {
    it('添加客户端连接', () => {
      const res = mockRes()
      const client = addClient(1, res)

      expect(client).toBeDefined()
      expect(client.id).toBeDefined()
      expect(client.res).toBe(res)

      res.triggerClose()
    })

    it('同一用户多个连接', () => {
      const res1 = mockRes()
      const res2 = mockRes()
      addClient(1, res1)
      addClient(1, res2)

      expect(getOnlineCount()).toBe(1)

      res1.triggerClose()
      res2.triggerClose()
    })

    it('客户端断开时自动清理', () => {
      const beforeCount = getOnlineCount()
      const res = mockRes()
      addClient(1, res)
      expect(getOnlineCount()).toBe(beforeCount + 1)

      res.triggerClose()
      expect(getOnlineCount()).toBe(beforeCount)
    })
  })

  describe('sendToUser', () => {
    it('向指定用户推送事件', () => {
      const res = mockRes()
      addClient(1, res)

      sendToUser(1, 'notice', { id: 1, title: 'test' })

      expect(res.write).toHaveBeenCalled()

      res.triggerClose()
    })

    it('用户不在线时不推送', () => {
      const res = mockRes()
      sendToUser(999, 'notice', { id: 1 })

      expect(res.write).not.toHaveBeenCalled()
    })
  })

  describe('broadcast', () => {
    it('向所有在线用户广播', () => {
      const res1 = mockRes()
      const res2 = mockRes()
      addClient(1, res1)
      addClient(2, res2)

      broadcast('notice', { title: 'test' })

      expect(res1.write).toHaveBeenCalled()
      expect(res2.write).toHaveBeenCalled()

      res1.triggerClose()
      res2.triggerClose()
    })

    it('无用户在线时不报错', () => {
      expect(() => broadcast('notice', {})).not.toThrow()
    })

    it('带 tenantId 时只推送给同租户连接（公告正文不跨租户下发）', () => {
      const inTenant = mockRes()
      const otherTenant = mockRes()
      const untagged = mockRes()
      addClient(1001, inTenant, 7)
      addClient(1002, otherTenant, 8)
      addClient(1003, untagged)

      broadcast('notice-published', { title: '仅租户 7' }, 7)

      expect(inTenant.write).toHaveBeenCalled()
      expect(otherTenant.write).not.toHaveBeenCalled()
      expect(untagged.write).not.toHaveBeenCalled()

      inTenant.triggerClose()
      otherTenant.triggerClose()
      untagged.triggerClose()
    })

    it('不带 tenantId 的平台级事件仍全量下发', () => {
      const a = mockRes()
      const b = mockRes()
      addClient(1004, a, 7)
      addClient(1005, b, 8)

      broadcast('heartbeat-ping', {})

      expect(a.write).toHaveBeenCalled()
      expect(b.write).toHaveBeenCalled()

      a.triggerClose()
      b.triggerClose()
    })
  })

  describe('getOnlineCount', () => {
    it('返回在线用户数', () => {
      const res1 = mockRes()
      const res2 = mockRes()
      addClient(1, res1)
      addClient(2, res2)

      expect(getOnlineCount()).toBe(2)

      res1.triggerClose()
      res2.triggerClose()
    })
  })
})
