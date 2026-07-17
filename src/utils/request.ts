/**
 * Axios HTTP Client
 *
 * 功能特性：
 * - 统一的请求/响应拦截器
 * - Access Token 自动注入
 * - Refresh Token 自动续期（队列机制）
 * - 强制下线处理
 * - 与 Pinia Stores 数据同步
 *
 * 注意：响应拦截器会将响应体直接解包返回 `ApiResponse<T>`，
 *       而非 `AxiosResponse<ApiResponse<T>>`。因此调用方应使用
 *       `res.data` 访问业务数据，使用 `res.code` 访问业务状态码。
 */
import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse, type AxiosError } from 'axios'
import { ElMessage } from 'element-plus'
import type { ApiResponse } from '@/types/response'
import { getCache, setCache, invalidateByUrl, buildGetCacheKey } from './requestCache'
import { startProgress, doneProgress } from './nprogress'
import { createAppError, AppError } from './errors'

/** 业务响应类型 —— 经过响应拦截器解包后，实际返回的就是 `ApiResponse<T>` */
export type BusinessResponse<T> = Promise<ApiResponse<T>>

/**
 * 扩展 Axios 实例，使 `request.get<T>()` 直接返回 `Promise<ApiResponse<T>>`
 * 以此实现 TypeScript 下的类型安全调用
 */
interface TypedAxiosInstance {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): BusinessResponse<T>
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): BusinessResponse<T>
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): BusinessResponse<T>
  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): BusinessResponse<T>
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): BusinessResponse<T>
  interceptors: AxiosInstance['interceptors']
  defaults: AxiosInstance['defaults']
  (config: AxiosRequestConfig): Promise<unknown>
}

/** 基础 Axios 实例（运行时行为由响应拦截器决定返回结构） */
const baseRequest: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
})

/** 导出的类型化实例（类型断言让 TS 编译期相信返回 ApiResponse<T>） */
const request = baseRequest as unknown as TypedAxiosInstance

// ==================== Token 管理（模块级变量，避免与 Store 循环依赖） ====================

/** @internal */
let accessToken: string | null = null

/** @internal */
let isRefreshing = false

/** @internal */
let pendingRequests: Array<(token: string | null) => void> = []

/** 设置 Access Token（同步到模块变量，供拦截器使用） */
export function setAccessToken(token: string | null): void {
  accessToken = token
}

/** 获取当前 Access Token */
export function getAccessToken(): string | null {
  return accessToken
}

// ==================== 响应数据提取工具 ====================

/**
 * 从响应中安全提取业务数据
 * @throws 当 code !== 0 时抛出 Error
 */
export function extractData<T>(response: ApiResponse<T>): T {
  if (response.code !== 0) {
    throw new Error(response.message || '请求失败')
  }
  return response.data
}

// ==================== 请求拦截器 ====================

baseRequest.interceptors.request.use(
  (config) => {
    startProgress()
    if (accessToken && config.headers) {
      ;(config.headers as Record<string, string>).Authorization = `Bearer ${accessToken}`
    }

    // GET 请求缓存：命中缓存则直接返回，跳过真实请求
    if (config.method?.toLowerCase() === 'get' && !(config as unknown as Record<string, unknown>).skipCache) {
      const cacheKey = buildGetCacheKey(config.url || '', config.params)
      const cached = getCache(cacheKey)
      if (cached !== null) {
        config.adapter = (adapterConfig: AxiosRequestConfig) => {
          return Promise.resolve({
            data: cached,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: adapterConfig,
          } as AxiosResponse)
        }
      }
    }

    return config
  },
  (error: AxiosError) => Promise.reject(error),
)

// ==================== 响应拦截器 ====================

/**
 * 使用 Refresh Token 换取新 Access Token
 */
async function refreshAccessToken(): Promise<string> {
  const res = await axios.post<ApiResponse<{ accessToken: string }>>('/api/v1/auth/token', {}, { withCredentials: true })
  const newToken = res.data.data.accessToken
  setAccessToken(newToken)
  return newToken
}

/**
 * 执行登出：清空所有登录态并跳转登录页
 *
 * 注意：必须经由 userStore.logout() 统一清理，
 * 否则 userStore.isLoggedIn（依赖 userInfo）与 accessToken 模块变量
 * 会出现状态不一致，导致路由守卫无法正确拦截已失效的会话。
 */
function performLogout(message?: string): void {
  // 同步 store 登录态（同时清 localStorage 与 userInfo）
  try {
    import('../stores/pinia').then(({ pinia }) => {
      import('../stores/userStore').then(({ useUserStore }) => {
        useUserStore(pinia).logout()
      })
    })
  } catch {
    // store 不可用（极端情况），退化为直接清 localStorage
    try {
      localStorage.removeItem('user')
      localStorage.removeItem('passwordResetRequired')
    } catch {
      // 忽略
    }
  }
  try {
    setAccessToken(null)
    isRefreshing = false
    pendingRequests = []
  } catch {
    // 重置刷新队列状态失败，忽略
  }
  if (message) {
    setTimeout(() => {
      ElMessage.error(message)
    }, 0)
  }
  // 动态导入 router 避免循环依赖
  import('../router/index')
    .then(({ default: router }) => {
      if (router.currentRoute.value.path !== '/login') {
        router.push('/login')
      }
    })
    .catch(() => {
      window.location.href = '/login'
    })
}

/** 执行登出（供外部组件使用） */
export { performLogout }

const responseFulfilled = (response: AxiosResponse<ApiResponse | Blob>): AxiosResponse<ApiResponse> | ApiResponse => {
  doneProgress()
  // blob 类型直接返回（文件下载场景），构造一个符合 ApiResponse 结构的结果
  if (response.config.responseType === 'blob') {
    return {
      ...response,
      data: { code: 0, data: response.data as unknown, message: 'ok' },
    } as AxiosResponse<ApiResponse>
  }
  const res = response.data as ApiResponse

  // 缓存 GET 请求成功结果
  if (response.config.method?.toLowerCase() === 'get' && res.code === 0) {
    const cacheKey = buildGetCacheKey(response.config.url || '', response.config.params)
    setCache(cacheKey, res)
  }

  // 非 GET 请求成功后清除相关缓存
  if (response.config.method?.toLowerCase() !== 'get' && res.code === 0) {
    invalidateByUrl(response.config.url || '')
  }

  if (res.code !== 0) {
    // 业务错误：抛出让上层 catch 处理
    throw new AppError(res.message || '请求失败', 'BUSINESS_ERROR', res.code)
  }
  return res
}

// 成功响应：解包成 ApiResponse<T>

baseRequest.interceptors.response.use(
  responseFulfilled as unknown as (response: AxiosResponse) => AxiosResponse<unknown> | Promise<AxiosResponse<unknown>>,
  // 失败响应：处理 401、强制下线等
  async (error: AxiosError<ApiResponse<unknown>>): Promise<unknown> => {
    doneProgress()
    const { response, config } = error

    // P0：无响应 = 网络错误，统一映射为 AppError
    if (!response) {
      return Promise.reject(createAppError(error))
    }

    if (!config) {
      return Promise.reject(error)
    }

    const { status, data } = response

    // P0：HTTP 状态码统一映射为用户可读的中文提示
    const statusMessages: Record<number, string> = {
      400: '请求参数错误',
      403: '您没有权限执行此操作',
      404: '请求的资源不存在',
      500: '服务器内部错误，请稍后重试',
      502: '网关错误，请稍后重试',
      503: '服务暂时不可用，请稍后重试',
      504: '网关超时，请稍后重试',
    }
    if (!data?.message && statusMessages[status]) {
      error.message = statusMessages[status]
    }

    // 非 401 或登录相关接口，直接拒绝
    if (status !== 401 || (config.url && (config.url === '/auth/login' || config.url === '/auth/token'))) {
      return Promise.reject(createAppError(error))
    }

    // 用户被强制下线
    if ((data as unknown as Record<string, unknown>)?.kicked) {
      performLogout(((data as unknown as Record<string, unknown>)?.message as string) || '您的账号已被管理员强制下线，请重新登录')
      return Promise.reject(createAppError(error))
    }

    // Token 过期，尝试刷新
    if (!isRefreshing) {
      isRefreshing = true
      try {
        const newToken = await refreshAccessToken()
        isRefreshing = false
        const queue = pendingRequests
        pendingRequests = []
        queue.forEach((cb) => cb(newToken))
        if (config.headers) {
          ;(config.headers as Record<string, string>).Authorization = `Bearer ${newToken}`
        }
        return baseRequest(config)
      } catch (err) {
        performLogout('登录已过期，请重新登录')
        return Promise.reject(createAppError(err))
      }
    }

    // 正在刷新中，其他请求排队等待
    return new Promise((resolve, reject) => {
      pendingRequests.push((token: string | null) => {
        if (!token) {
          return reject(new AppError('登录已过期，请重新登录', 'UNAUTHORIZED'))
        }
        if (config.headers) {
          ;(config.headers as Record<string, string>).Authorization = `Bearer ${token}`
        }
        resolve(baseRequest(config))
      })
    })
  },
)

export default request
