// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../models/Message.js', () => ({
  default: { findByPk: vi.fn(), create: vi.fn() },
}))
vi.mock('../models/User.js', () => ({
  default: { findByPk: vi.fn() },
}))

import Message from '../models/Message.js'
import User from '../models/User.js'
import { markMessageRead, deleteMessage, createMessage } from '../services/messageService.js'

const mockMessageFindByPk = vi.mocked(Message.findByPk)
const mockMessageCreate = vi.mocked(Message.create)
const mockUserFindByPk = vi.mocked(User.findByPk)

function messageRow(overrides: Record<string, unknown> = {}) {
  const row = {
    id: 1,
    toUserId: 10,
    fromUserId: 2,
    title: 't',
    content: 'c',
    isRead: false,
    readAt: null,
    save: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  return row
}

describe('消息归属校验（按 id 直查的 IDOR）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('markMessageRead', () => {
    it('非收件人不能标记他人消息已读', async () => {
      mockMessageFindByPk.mockResolvedValue(messageRow({ toUserId: 999 }) as any)

      await expect(markMessageRead(1, true, 10)).rejects.toMatchObject({ statusCode: 403 })
    })

    it('收件人可以标记已读', async () => {
      const row = messageRow()
      mockMessageFindByPk.mockResolvedValue(row as any)

      await expect(markMessageRead(1, true, 10)).resolves.toEqual({ markedRead: true })
      expect(row.save).toHaveBeenCalled()
    })

    it('全员广播（toUserId 为空）收件人可标记', async () => {
      mockMessageFindByPk.mockResolvedValue(messageRow({ toUserId: null }) as any)

      await expect(markMessageRead(1, true, 10)).resolves.toEqual({ markedRead: true })
    })

    it('未读查询同样受限，避免用 PATCH 读他人消息正文', async () => {
      mockMessageFindByPk.mockResolvedValue(messageRow({ toUserId: 999 }) as any)

      await expect(markMessageRead(1, false, 10)).rejects.toMatchObject({ statusCode: 403 })
    })

    it('跨租户/不存在的消息返回 404', async () => {
      mockMessageFindByPk.mockResolvedValue(null as any)

      await expect(markMessageRead(1, true, 10)).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  describe('deleteMessage', () => {
    it('只能删除自己收到或发出的消息', async () => {
      mockMessageFindByPk.mockResolvedValue(messageRow({ toUserId: 999, fromUserId: 888 }) as any)
      await expect(deleteMessage(1, 10)).rejects.toMatchObject({ statusCode: 403 })

      const mine = messageRow()
      mockMessageFindByPk.mockResolvedValue(mine as any)
      await expect(deleteMessage(1, 10)).resolves.toBeUndefined()
      expect(mine.destroy).toHaveBeenCalled()

      const sent = messageRow({ toUserId: 999, fromUserId: 10 })
      mockMessageFindByPk.mockResolvedValue(sent as any)
      await expect(deleteMessage(1, 10)).resolves.toBeUndefined()
    })
  })

  describe('createMessage', () => {
    it('接收者必须存在于当前租户（钩子过滤后查不到即拒绝）', async () => {
      mockUserFindByPk.mockResolvedValue(null as any)

      await expect(createMessage({ fromUserId: 10, toUserId: 999, title: 't', content: 'c' })).rejects.toMatchObject({ statusCode: 404 })
      expect(mockMessageCreate).not.toHaveBeenCalled()
    })

    it('广播消息不需要接收者存在校验', async () => {
      mockMessageCreate.mockResolvedValue(messageRow({ toUserId: null }) as any)

      await expect(createMessage({ fromUserId: 10, toUserId: null, title: 't', content: 'c' })).resolves.toBeTruthy()
      expect(mockUserFindByPk).not.toHaveBeenCalled()
    })
  })
})
