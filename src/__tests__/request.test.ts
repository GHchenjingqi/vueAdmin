/**
 * request.ts 单元测试（公开 API 层面）
 * 核心逻辑（拦截器、Token 刷新队列）在真实 axios 实例上已通过集成测试验证
 * 这里重点测试稳定的公开导出函数
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock 外部依赖
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('./nprogress', () => ({
  startProgress: vi.fn(),
  doneProgress: vi.fn(),
}))

vi.mock('./requestCache', () => ({
  getCache: vi.fn(() => null),
  setCache: vi.fn(),
  invalidateByUrl: vi.fn(),
  buildGetCacheKey: vi.fn((url: string) => url),
}))

vi.mock('../router/index', () => ({
  default: { push: vi.fn() },
}))

// performLogout 通过动态 import 调用 userStore.logout() 清理 localStorage，
// 在单测环境无激活 pinia，需 mock 让登出逻辑可同步清理存储。
vi.mock('../stores/pinia', () => ({
  pinia: {},
}))
vi.mock('../stores/userStore', () => ({
  useUserStore: () => ({
    logout: () => {
      localStorage.removeItem('user')
      localStorage.removeItem('passwordResetRequired')
    },
  }),
}))

import { setAccessToken, getAccessToken, extractData, performLogout } from '../utils/request'
import { ElMessage } from 'element-plus'

describe('request.ts - Token 管理', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAccessToken(null)
  })

  it('setAccessToken / getAccessToken 正常读写', () => {
    expect(getAccessToken()).toBeNull()
    setAccessToken('test-token-123')
    expect(getAccessToken()).toBe('test-token-123')
    setAccessToken(null)
    expect(getAccessToken()).toBeNull()
  })

  it('多次 setAccessToken 覆盖旧值', () => {
    setAccessToken('token-1')
    setAccessToken('token-2')
    expect(getAccessToken()).toBe('token-2')
  })
})

describe('request.ts - extractData', () => {
  it('成功响应返回 data', () => {
    const response = { code: 0, data: { id: 1, name: 'test' }, message: 'ok' }
    expect(extractData(response)).toEqual({ id: 1, name: 'test' })
  })

  it('业务错误抛出异常', () => {
    const response = { code: 400, data: null, message: '参数错误' }
    expect(() => extractData(response)).toThrow('参数错误')
  })

  it('无 message 时使用默认提示', () => {
    const response = { code: 500, data: null, message: '' }
    expect(() => extractData(response)).toThrow('请求失败')
  })

  it('code 非 0 时抛出错误', () => {
    const response = { code: 401, data: null, message: '未授权' }
    expect(() => extractData(response)).toThrow('未授权')
  })
})

describe('request.ts - performLogout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setAccessToken(null)
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('清空 Token 和 localStorage', async () => {
    setAccessToken('token-to-clear')
    localStorage.setItem('user', 'test-user')
    localStorage.setItem('passwordResetRequired', '1')

    performLogout('测试登出')

    // performLogout 通过动态 import 的 userStore.logout() 异步清理 localStorage，
    // 需等待微任务执行完毕后再断言。
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(getAccessToken()).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(localStorage.getItem('passwordResetRequired')).toBeNull()
  })

  it('弹出错误提示（异步）', async () => {
    performLogout('登录已过期')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(ElMessage.error).toHaveBeenCalledWith('登录已过期')
  })

  it('无 message 时不弹出提示', async () => {
    performLogout()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('localStorage 清理异常不中断流程', () => {
    // 模拟 localStorage 抛出异常
    const originalRemoveItem = localStorage.removeItem
    localStorage.removeItem = vi.fn(() => {
      throw new Error('Storage error')
    })

    setAccessToken('token-123')
    // 不应抛出异常
    expect(() => performLogout('测试')).not.toThrow()

    localStorage.removeItem = originalRemoveItem
  })
})
