/**
 * request.ts 单元测试
 *
 * 覆盖两部分：
 * 1. 公开 API（Token 读写、extractData、performLogout）
 * 2. 拦截器核心逻辑（请求拦截器：Token 注入 / GET 缓存短路；
 *    响应拦截器成功分支：blob、GET 缓存、业务错误、解包；
 *    响应拦截器失败分支：网络错误、401 刷新队列、强制下线、状态码映射）
 *
 * 说明：request.ts 内部创建私有 axios 实例并挂载拦截器，这里通过 mock axios
 * 捕获已注册的拦截器 handler，直接驱动它们以覆盖原本难以触达的分支。
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

vi.mock('../utils/requestCache', () => ({
  getCache: vi.fn(() => null),
  setCache: vi.fn(),
  invalidateByUrl: vi.fn(),
  buildGetCacheKey: vi.fn((url: string) => url),
}))

vi.mock('../router/index', () => ({
  default: { push: vi.fn(), currentRoute: { value: { path: '/' } } },
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

// ---- axios mock：捕获拦截器 handler，并可控 axios.post（刷新用） ----
vi.mock('axios', () => {
  const handlers = {
    request: { fulfilled: null as any, rejected: null as any },
    response: { fulfilled: null as any, rejected: null as any },
  }
  // 模拟 axios 实例：可被调用（刷新重试时 baseRequest(config)），并注册拦截器
  const instance: any = (cfg: any) =>
    Promise.resolve({
      data: { code: 0, data: 'retry-ok', message: 'ok' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: cfg,
    })
  instance.interceptors = {
    request: {
      use: (f: any, r: any) => {
        handlers.request = { fulfilled: f, rejected: r }
      },
    },
    response: {
      use: (f: any, r: any) => {
        handlers.response = { fulfilled: f, rejected: r }
      },
    },
  }
  instance.defaults = {}
  const axiosDefault: any = {
    create: vi.fn(() => instance),
    post: vi.fn(() => Promise.resolve({ data: { code: 0, data: { accessToken: 'new-token' }, message: 'ok' } })),
  }
  axiosDefault.__handlers = handlers
  axiosDefault.__instance = instance
  return { default: axiosDefault }
})

import axios from 'axios'
import { setAccessToken, getAccessToken, extractData, performLogout } from '../utils/request'
import { ElMessage } from 'element-plus'
import { getCache, setCache, invalidateByUrl } from '../utils/requestCache'

const handlers = (axios as any).__handlers

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
    const originalRemoveItem = localStorage.removeItem
    localStorage.removeItem = vi.fn(() => {
      throw new Error('Storage error')
    })

    setAccessToken('token-123')
    expect(() => performLogout('测试')).not.toThrow()

    localStorage.removeItem = originalRemoveItem
  })
})

describe('request.ts - 请求拦截器', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAccessToken(null)
  })

  it('注入 Authorization 头（当有 Token）', () => {
    setAccessToken('abc')
    const out = handlers.request.fulfilled({ headers: {}, method: 'get', url: '/x' })
    expect((out.headers as Record<string, string>).Authorization).toBe('Bearer abc')
  })

  it('无 Token 时不注入 Authorization', () => {
    const out = handlers.request.fulfilled({ headers: {}, method: 'get', url: '/x' })
    expect((out.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('GET 命中缓存时短路（替换 adapter 返回缓存结果）', async () => {
    ;(getCache as any).mockReturnValue({ code: 0, data: 'cached', message: 'ok' })
    const config: any = { headers: {}, method: 'get', url: '/articles', params: { a: 1 } }
    const out = handlers.request.fulfilled(config)
    expect(typeof out.adapter).toBe('function')
    const adapted: any = await out.adapter(config)
    expect(adapted.data).toEqual({ code: 0, data: 'cached', message: 'ok' })
  })

  it('GET 未命中缓存时不替换 adapter', () => {
    ;(getCache as any).mockReturnValue(null)
    const config: any = { headers: {}, method: 'get', url: '/articles' }
    const out = handlers.request.fulfilled(config)
    expect(out.adapter).toBeUndefined()
  })
})

describe('request.ts - 响应拦截器（成功分支）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const baseResponse = (over: any = {}) => ({
    config: { method: 'get', url: '/x', params: {}, responseType: 'json' },
    data: { code: 0, data: { id: 1 }, message: 'ok' },
    status: 200,
    statusText: 'OK',
    headers: {},
    ...over,
  })

  it('成功响应解包为 ApiResponse 并缓存 GET', async () => {
    const res: any = await handlers.response.fulfilled(baseResponse())
    expect(res).toEqual({ code: 0, data: { id: 1 }, message: 'ok' })
    expect(setCache).toHaveBeenCalled()
  })

  it('blob 响应类型包裹为 code 0 结构', async () => {
    const blob = new Blob(['x'])
    const res: any = await handlers.response.fulfilled(baseResponse({ config: { method: 'get', url: '/d', responseType: 'blob' }, data: blob }))
    expect(res.data.code).toBe(0)
    expect(res.data.data).toBe(blob)
    expect(setCache).not.toHaveBeenCalled()
  })

  it('非 GET 成功后使相关缓存失效', async () => {
    await handlers.response.fulfilled(baseResponse({ config: { method: 'post', url: '/users' } }))
    expect(invalidateByUrl).toHaveBeenCalledWith('/users')
  })

  it('业务错误（code != 0）抛出 AppError', async () => {
    await expect(handlers.response.fulfilled(baseResponse({ data: { code: 400, data: null, message: '参数错误' } }))).rejects.toThrow('参数错误')
  })
})

describe('request.ts - 响应拦截器（失败分支）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAccessToken(null)
    // 默认刷新成功
    ;(axios as any).post.mockResolvedValue({
      data: { code: 0, data: { accessToken: 'new-token' }, message: 'ok' },
    })
  })

  const axiosErr = (over: any = {}) => ({
    message: '',
    config: { url: '/users', headers: {} },
    ...over,
  })

  it('网络错误（无 response）映射为 NETWORK_ERROR', async () => {
    let caught: any
    try {
      await handlers.response.rejected(axiosErr({ message: 'Network Error' }))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeDefined()
    expect(caught.code).toBe('NETWORK_ERROR')
  })

  it('401 但为登录/刷新接口时不触发刷新，直接拒绝', async () => {
    let caught: any
    try {
      await handlers.response.rejected(axiosErr({ response: { status: 401, data: { message: '' } }, config: { url: '/auth/login', headers: {} } }))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeDefined()
    expect((axios as any).post).not.toHaveBeenCalled()
  })

  it('401 普通接口触发刷新并自动重试', async () => {
    const result: any = await handlers.response.rejected(axiosErr({ response: { status: 401, data: { message: '' } } }))
    expect((axios as any).post).toHaveBeenCalledWith('/api/v1/auth/token', {}, { withCredentials: true })
    // 重试由 mock 实例返回 raw 响应
    expect(result.data.data).toBe('retry-ok')
    expect(getAccessToken()).toBe('new-token')
  })

  it('401 刷新失败触发登出并跳转登录页', async () => {
    ;(axios as any).post.mockRejectedValue(new Error('refresh failed'))
    let caught: any
    try {
      await handlers.response.rejected(axiosErr({ response: { status: 401, data: { message: '' } } }))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeDefined()
    // performLogout 通过动态 import 异步跳转，等待微任务
    await new Promise((resolve) => setTimeout(resolve, 10))
    const router = await import('../router/index')
    expect((router.default as any).push).toHaveBeenCalledWith('/login')
  })

  it('被强制下线（kicked）跳登录页', async () => {
    let caught: any
    try {
      await handlers.response.rejected(axiosErr({ response: { status: 401, data: { kicked: true, message: '已被踢' } } }))
    } catch (e) {
      caught = e
    }
    expect(caught).toBeDefined()
    // performLogout 通过动态 import 异步跳转，等待微任务
    await new Promise((resolve) => setTimeout(resolve, 10))
    const router = await import('../router/index')
    expect((router.default as any).push).toHaveBeenCalledWith('/login')
  })

  it('403 映射为中文提示', async () => {
    let caught: any
    try {
      await handlers.response.rejected(axiosErr({ response: { status: 403, data: {} } }))
    } catch (e) {
      caught = e
    }
    expect(caught.message).toBe('您没有权限执行此操作')
  })

  it('500 业务消息优先于 HTTP 文案', async () => {
    let caught: any
    try {
      await handlers.response.rejected(axiosErr({ response: { status: 500, data: { message: '数据库炸了' } } }))
    } catch (e) {
      caught = e
    }
    expect(caught.message).toBe('数据库炸了')
    expect(caught.code).toBe('SERVER_ERROR')
  })
})
