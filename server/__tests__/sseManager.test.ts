import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addClient, sendToUser, broadcast, getOnlineCount } from '../utils/sseManager'

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