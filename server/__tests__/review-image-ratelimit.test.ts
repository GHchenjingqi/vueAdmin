// @vitest-environment node
/**
 * P4-T08 评价图片上传/删除速率限制 + 限流拦截（CWE-770 / CWE-639 修复回归）
 *
 * 覆盖：
 *  - 上传/删除端点命中限流时返回 429，且不再执行后续逻辑（上传不落盘、删除不调 deleteUploadedFile）；
 *  - 未超限时正常放行（上传进入 multer→校验、删除调用 deleteUploadedFile 且 id 归一为 reviews/<basename>）；
 *  - 连续超过阈值后被拦截（验证计数口径）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

// —— 限流键状态（在 mock 工厂闭包内共享，可重置） ——
const hoist = vi.hoisted(() => ({ calls: 0, blockAfter: Infinity as number }))

vi.mock('../middleware/rateLimiter.js', () => ({
  checkKeyedRateLimit: vi.fn(async () => {
    hoist.calls += 1
    if (hoist.calls > hoist.blockAfter) {
      return { allowed: false, remaining: 0, retryAfter: 60 }
    }
    return { allowed: true, remaining: Math.max(0, hoist.blockAfter - hoist.calls) }
  }),
}))

vi.mock('../services/uploadService.js', () => ({
  deleteUploadedFile: vi.fn(async () => undefined),
}))

// 最小化 multer mock：array 返回中间件，落空文件并回调成功（不真正解析 multipart）
vi.mock('multer', () => {
  const array = vi.fn(() => (_req: any, _res: any, cb: any) => {
    _req.files = []
    cb(null)
  })
  const multerMock: any = (..._args: any[]) => ({ array })
  multerMock.diskStorage = () => ({})
  multerMock.MulterError = class MulterError extends Error {}
  return { default: multerMock }
})

import { uploadReviewImages, removeReviewImage } from '../modules/storefront/controllers/reviewImageController.js'
import { deleteUploadedFile } from '../services/uploadService.js'
import { checkKeyedRateLimit } from '../middleware/rateLimiter.js'

function mockReq(ip = '1.2.3.4'): Request {
  return { ip, headers: {}, params: {}, body: {}, files: [] } as unknown as Request
}

function mockRes() {
  const res: any = {}
  res.status = vi.fn(() => res)
  res.json = vi.fn(() => res)
  return res
}

beforeEach(() => {
  hoist.calls = 0
  hoist.blockAfter = Infinity
  vi.mocked(checkKeyedRateLimit).mockClear()
  vi.mocked(deleteUploadedFile).mockClear()
})

describe('评价图片上传/删除限流', () => {
  it('删除未超限时正常调用 deleteUploadedFile，且 id 归一为 reviews/<basename>', async () => {
    const req = mockReq()
    req.params = { id: 'reviews/abc-123.png' } as any
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await removeReviewImage(req, res, next)

    expect(deleteUploadedFile).toHaveBeenCalledWith('reviews/abc-123.png')
    expect(res.json).toHaveBeenCalledWith({ code: 0, message: '删除成功' })
    expect(next).not.toHaveBeenCalled()
  })

  it('删除命中限流时返回 429，且不调用 deleteUploadedFile', async () => {
    hoist.blockAfter = 0 // 首次即拦截
    const req = mockReq()
    req.params = { id: 'reviews/x.png' } as any
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await removeReviewImage(req, res, next)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 429 }))
    expect(deleteUploadedFile).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('上传未超限时放行，进入 multer→校验（空文件触发「至少一张」校验）', async () => {
    const req = mockReq()
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await uploadReviewImages(req, res, next)

    // 放行后不会返回 429；空文件经 validateReviewImages 抛「至少上传一张」→ 交给 next
    expect(res.status).not.toHaveBeenCalledWith(429)
    expect(next).toHaveBeenCalled()
    const err = vi.mocked(next).mock.calls[0][0] as any
    expect(err).toBeInstanceOf(Error)
  })

  it('上传命中限流时返回 429，且不进入 multer/落盘逻辑', async () => {
    hoist.blockAfter = 0
    const req = mockReq()
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await uploadReviewImages(req, res, next)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 429 }))
    expect(next).not.toHaveBeenCalled()
  })

  it('连续超过阈值（20 次/10 分钟）后第 21 次被拦截', async () => {
    hoist.blockAfter = 20
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    // 前 20 次删除放行（仅验证第 21 次被拦，断言不抛错）
    for (let i = 0; i < 20; i++) {
      const r = mockReq()
      r.params = { id: `reviews/${i}.png` } as any
      await removeReviewImage(r, mockRes(), vi.fn() as unknown as NextFunction)
    }
    await removeReviewImage(mockReq(), res, next)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(deleteUploadedFile).toHaveBeenCalledTimes(20)
  })
})
