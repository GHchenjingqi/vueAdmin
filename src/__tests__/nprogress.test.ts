/**
 * nprogress.ts 单元测试
 * 注意：模块有内部状态（activeRequests），测试间不隔离
 * 延迟启动：startProgress 有 200ms 延迟
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import NProgress from 'nprogress'

// Mock NProgress
vi.mock('nprogress', () => ({
  default: {
    configure: vi.fn(),
    start: vi.fn(),
    done: vi.fn(),
  },
}))

// Mock nprogress.css（空导入）
vi.mock('nprogress/nprogress.css', () => ({}))

import { startProgress, doneProgress, forceDoneProgress } from '../utils/nprogress'

describe('nprogress.ts', () => {
  beforeAll(() => {
    // 开始前强制清零
    forceDoneProgress()
    vi.clearAllMocks()
  })

  afterAll(() => {
    // 结束后清零
    forceDoneProgress()
  })

  it('首次 startProgress 设置延迟定时器', async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    startProgress()
    // 200ms 内未调用 start
    expect(NProgress.start).not.toHaveBeenCalled()

    // 快进 200ms
    vi.advanceTimersByTime(200)
    expect(NProgress.start).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
    forceDoneProgress()
  })

  it('快速完成（<200ms）不调用 start', async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    startProgress()
    // 100ms 后完成（< 200ms）
    vi.advanceTimersByTime(100)
    doneProgress()

    // 未调用 start
    expect(NProgress.start).not.toHaveBeenCalled()
    expect(NProgress.done).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('多个并发请求：延迟启动后只调用一次 start', async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    startProgress()
    startProgress()
    startProgress()

    // 快进 200ms
    vi.advanceTimersByTime(200)
    expect(NProgress.start).toHaveBeenCalledTimes(1)

    // 逐个完成
    doneProgress()
    expect(NProgress.done).not.toHaveBeenCalled()

    doneProgress()
    expect(NProgress.done).not.toHaveBeenCalled()

    doneProgress()
    expect(NProgress.done).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('forceDoneProgress 清除定时器并强制完成', async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    startProgress()
    // 100ms 后强制完成（< 200ms）
    vi.advanceTimersByTime(100)
    forceDoneProgress()

    // 未调用 start（定时器被清除）
    expect(NProgress.start).not.toHaveBeenCalled()
    expect(NProgress.done).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('正常流程：start → 延迟 200ms → done', async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    startProgress()
    vi.advanceTimersByTime(200)
    doneProgress()

    expect(NProgress.start).toHaveBeenCalled()
    expect(NProgress.done).toHaveBeenCalled()

    vi.useRealTimers()
  })
})
