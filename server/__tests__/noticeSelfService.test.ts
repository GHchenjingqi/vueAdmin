// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

vi.mock('../models/Notice.js', () => ({ default: { findByPk: vi.fn() } }))
vi.mock('../models/NoticeRead.js', () => ({ default: { findOrCreate: vi.fn() } }))

import Notice from '../models/Notice.js'
import NoticeRead from '../models/NoticeRead.js'
import { markNoticeRead } from '../services/noticeService.js'

const mockNoticeFindByPk = vi.mocked(Notice.findByPk)
const mockFindOrCreate = vi.mocked(NoticeRead.findOrCreate)

const ROUTES = readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'routes', 'index.ts'), 'utf8')

describe('通知自助已读接口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('已读记录只记在调用者名下', async () => {
    mockNoticeFindByPk.mockResolvedValue({ id: 5 } as any)
    mockFindOrCreate.mockResolvedValue([{} as any, true])

    await expect(markNoticeRead(5, 10)).resolves.toEqual({ markedRead: true })
    expect(mockFindOrCreate).toHaveBeenCalledWith({ where: { noticeId: 5, userId: 10 }, defaults: { noticeId: 5, userId: 10 } })
  })

  it('跨租户/不存在的通知返回 404 且不写已读记录', async () => {
    mockNoticeFindByPk.mockResolvedValue(null as any)

    await expect(markNoticeRead(5, 10)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockFindOrCreate).not.toHaveBeenCalled()
  })

  it('PATCH /notices/:id 走自助已读处理器，不能改正文或状态', () => {
    expect(ROUTES).toMatch(/router\.patch\('\/notices\/:id',\s*authMiddleware,\s*noticeController\.markRead\)/)
  })
})
