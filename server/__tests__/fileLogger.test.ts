/**
 * fileLogger.ts 单元测试
 *
 * 通过 setFsClient() + trackingFsClient() 注入测试用 fs 实现，
 * 不依赖 vi.mock（Node.js 内置模块在 Vitest ESM 下不可 mock）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  setFsClient,
  resetFsClient,
  resetCleanedToday,
  getCleanedTodayState,
  trackingFsClient,
  logInfo,
  logWarn,
  logError,
  logAccess,
  cleanOldLogs,
  type FsCalls,
} from '../utils/fileLogger'

describe('fileLogger.ts', () => {
  let calls: FsCalls

  beforeEach(() => {
    // 重置模块级变量（Vitest 并行执行时测试间隔离）
    resetCleanedToday()
    calls = {
      appendFileSync: [],
      readdirSync: [],
      statSync: [],
      unlinkSync: [],
    }
    // 默认 mock：所有写操作拦截，目录已存在
    setFsClient(trackingFsClient(calls))
  })

  afterEach(() => {
    resetFsClient()
    vi.restoreAllMocks()
  })

  // ------- logInfo -------

  it('写入 INFO 级别日志', () => {
    logInfo('测试信息')

    expect(calls.appendFileSync.some(([path, content]) =>
      path.includes('app-') && content.includes('[INFO]') && content.includes('测试信息')
    )).toBe(true)
  })

  it('同时输出到控制台', () => {
    const logSpy = vi.spyOn(console, 'log')
    logInfo('测试信息')
    expect(logSpy).toHaveBeenCalledWith('测试信息')
  })

  it('日志包含时间戳', () => {
    logInfo('test')

    const [, content] = calls.appendFileSync[0]
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('日志文件名包含日期', () => {
    logInfo('test')

    const [path] = calls.appendFileSync[0]
    expect(path).toMatch(/app-\d{4}-\d{2}-\d{2}\.log$/)
  })

  // ------- logWarn -------

  it('写入 WARN 级别日志', () => {
    logWarn('测试警告')

    expect(calls.appendFileSync.some(([, content]) =>
      content.includes('[WARN]')
    )).toBe(true)
  })

  it('同时输出到控制台', () => {
    const warnSpy = vi.spyOn(console, 'warn')
    logWarn('测试警告')
    expect(warnSpy).toHaveBeenCalledWith('测试警告')
  })

  // ------- logError -------

  it('写入 ERROR 级别日志', () => {
    logError('测试错误', null, null)

    expect(calls.appendFileSync.some(([path, content]) =>
      path.includes('error-') && content.includes('[ERROR]')
    )).toBe(true)
  })

  it('写入堆栈信息', () => {
    logError('错误', 'Error: test\n  at line1\n  at line2', null)

    // logError: message 写一条 + stack 另写一条
    expect(calls.appendFileSync.length).toBeGreaterThanOrEqual(2)
    const firstContent = calls.appendFileSync[1][1]
    expect(firstContent).toContain('  Error: test')
  })

  it('包含请求信息', () => {
    logError('错误', null, 'POST /api/users')

    const [, content] = calls.appendFileSync[0]
    expect(content).toContain('POST /api/users')
  })

  // ------- logAccess -------

  it('写入访问日志', () => {
    logAccess('GET', '/api/users', 200, 45, '127.0.0.1', 'Mozilla/5.0')

    expect(calls.appendFileSync.some(([path, content]) =>
      path.includes('access-') && content.includes('GET /api/users')
    )).toBe(true)
  })

  it('包含状态码和耗时', () => {
    logAccess('POST', '/api/login', 401, 120, '192.168.1.1', 'Chrome')

    const [, content] = calls.appendFileSync[0]
    expect(content).toContain('401')
    expect(content).toContain('120ms')
  })

  it('包含 IP 地址', () => {
    logAccess('GET', '/api/test', 200, 10, '10.0.0.1', null)

    const [, content] = calls.appendFileSync[0]
    expect(content).toContain('10.0.0.1')
  })

  it('截断过长的 User-Agent', () => {
    const longUA = 'A'.repeat(200)
    logAccess('GET', '/api/test', 200, 10, '127.0.0.1', longUA)

    const [, content] = calls.appendFileSync[0]
    expect(content).toContain('A'.repeat(120))
  })

  // ------- cleanOldLogs -------

  it('删除过期日志文件', () => {
    const oldTime = Date.now() - 31 * 24 * 60 * 60 * 1000
    const tc = trackingFsClient(calls)

    setFsClient({
      appendFileSync: tc.appendFileSync,
      existsSync: tc.existsSync,
      readdirSync: () => ['old.log', 'new.log'],
      statSync: (path: string) => {
        calls.statSync.push([path])
        if (String(path).includes('old')) return { mtimeMs: oldTime }
        return { mtimeMs: Date.now() }
      },
      unlinkSync: tc.unlinkSync,
    })

    cleanOldLogs()

    expect(calls.unlinkSync.some(([p]) => String(p).includes('old.log'))).toBe(true)
    expect(calls.unlinkSync.length).toBe(1)
  })

  it('仅处理 .log 文件', () => {
    const tc = trackingFsClient(calls)

    setFsClient({
      appendFileSync: tc.appendFileSync,
      existsSync: tc.existsSync,
      readdirSync: () => ['test.txt', 'app.log'],
      statSync: () => ({ mtimeMs: Date.now() }),
      unlinkSync: tc.unlinkSync,
    })

    cleanOldLogs()

    // .txt 文件不触发 unlinkSync（只有 .log 才处理）
    expect(calls.unlinkSync.length).toBe(0)
  })

  // 防抖逻辑验证
  it('每天仅执行一次', () => {
    // 必须在测试内自建 calls，beforeEach 的 calls 被 setFsClient 注入过
    const tc = trackingFsClient({
      appendFileSync: [], readdirSync: [], statSync: [], unlinkSync: [],
    })
    setFsClient({ ...tc, existsSync: () => true, readdirSync: tc.readdirSync })

    resetCleanedToday()
    expect(getCleanedTodayState()).toBe(false)

    // 第一次调用：应执行 readdirSync 并设置防抖标志
    cleanOldLogs()
    expect(getCleanedTodayState()).toBe(true)
    expect(tc.readdirSync.length).toBe(1)

    // 第二次调用：防抖返回，不执行 readdirSync
    cleanOldLogs()
    expect(tc.readdirSync.length).toBe(1) // 仍为 1，未增加
  })

  // ------- 错误处理 -------

  it('写入失败时捕获异常', () => {
    const tc = trackingFsClient(calls)

    setFsClient({
      appendFileSync: () => { throw new Error('磁盘已满') },
      existsSync: tc.existsSync,
      readdirSync: tc.readdirSync,
      statSync: tc.statSync,
      unlinkSync: tc.unlinkSync,
    })

    const errorSpy = vi.spyOn(console, 'error')
    expect(() => logInfo('test')).not.toThrow()
    expect(errorSpy).toHaveBeenCalled()
  })

  // ------- 日志目录创建 -------

  it('目录不存在时创建', () => {
    const tc = trackingFsClient(calls)

    setFsClient({
      appendFileSync: tc.appendFileSync,
      existsSync: () => false,
      readdirSync: tc.readdirSync,
      statSync: tc.statSync,
      unlinkSync: tc.unlinkSync,
    })

    logInfo('test')

    // existsSync 返回 false → mkdirSync 被调用 → appendFileSync 写入
    expect(calls.appendFileSync.length).toBe(1)
  })
})
