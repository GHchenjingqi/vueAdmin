/**
 * 全局应用错误类
 *
 * 在 Axios 拦截器中统一将网络/业务错误转换为此类型，
 * 所有业务层 catch 只需处理 AppError，消除多种错误处理风格混用。
 */

export type ErrorCode =
  'NETWORK_ERROR' | 'TIMEOUT' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'BUSINESS_ERROR' | 'VALIDATION_ERROR' | 'SERVER_ERROR' | 'UNKNOWN'

export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode = 'UNKNOWN',
    public status?: number,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }

  /** 是否是可重试的错误类型（网络超时、服务器错误等） */
  get isRetryable(): boolean {
    return ['NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR'].includes(this.code)
  }

  /** 是否与认证相关 */
  get isAuthError(): boolean {
    return this.code === 'UNAUTHORIZED'
  }
}

/** 网络错误码到 ErrorCode 的映射 */
const networkErrorMap: Record<string, ErrorCode> = {
  ERR_NETWORK: 'NETWORK_ERROR',
  ECONNABORTED: 'TIMEOUT',
  ECONNREFUSED: 'NETWORK_ERROR',
  ENOTFOUND: 'NETWORK_ERROR',
}

const statusErrorMap: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  500: 'SERVER_ERROR',
  502: 'SERVER_ERROR',
  503: 'SERVER_ERROR',
  504: 'SERVER_ERROR',
}

const statusMessages: Record<number, string> = {
  400: '请求参数错误',
  401: '登录已过期，请重新登录',
  403: '您没有权限执行此操作',
  404: '请求的资源不存在',
  500: '服务器内部错误，请稍后重试',
  502: '网关错误，请稍后重试',
  503: '服务暂时不可用，请稍后重试',
  504: '网关超时，请稍后重试',
}

const networkMessages: Record<string, string> = {
  NETWORK_ERROR: '网络连接失败，请检查您的网络连接',
  TIMEOUT: '请求超时，请稍后重试',
}

/**
 * 从 Axios 错误创建 AppError
 * 统一所有错误处理入口
 */
export function createAppError(err: unknown): AppError {
  if (err instanceof AppError) return err

  const axiosErr = err as {
    code?: string
    response?: { status?: number; data?: { message?: string; kicked?: boolean } }
    message?: string
  }

  // 无响应 = 网络错误
  if (!axiosErr.response) {
    const errorCode = networkErrorMap[axiosErr.code || ''] || 'NETWORK_ERROR'
    return new AppError(axiosErr.message || networkMessages[errorCode] || '网络请求失败', errorCode)
  }

  const status = axiosErr.response.status ?? 0
  const errorCode = statusErrorMap[status] || 'UNKNOWN'
  const bizMessage = axiosErr.response.data?.message
  const httpMessage = statusMessages[status]

  return new AppError(bizMessage || httpMessage || axiosErr.message || '请求失败', errorCode, status, axiosErr.response.data)
}

/** 从 AppError 或任意错误提取可读消息 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  // 处理带 message 属性的普通对象（如 Axios 错误对象的 data.message）
  if (err !== null && typeof err === 'object' && !Array.isArray(err)) {
    const msg = (err as Record<string, unknown>).message
    if (typeof msg === 'string') return msg
  }
  return '未知错误'
}

/** 检查是否为用户取消操作（如 ElMessageBox.confirm 的 catch） */
export function isUserCancel(err: unknown): boolean {
  return err === 'cancel' || (err instanceof Error && err.message === 'cancel')
}

/** 检查是否为网络错误 */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false
  const message = err instanceof Error ? err.message : String(err)
  return /network|fetch|connection|timeout|ECONN/i.test(message)
}

/** 检查是否为认证/授权错误（401/403） */
export function isAuthError(err: unknown): boolean {
  if (!err || !(err instanceof Error)) return false
  const appErr = err as AppError
  // AppError 实例直接读 status；Axios 风格的 plain Error 从 response 对象读取
  if (appErr.status === 401 || appErr.status === 403) return true
  const axiosErr = err as { response?: { status?: number } }
  if (axiosErr.response?.status === 401 || axiosErr.response?.status === 403) return true
  return appErr.code === 'UNAUTHORIZED' || appErr.code === 'FORBIDDEN'
}

/** 检查是否为验证错误（400 或 Validation 相关） */
export function isValidationError(err: unknown): boolean {
  if (!err) return false
  if (err instanceof Error) {
    const appErr = err as AppError
    if (appErr.status === 400) return true
    if (appErr.code === 'VALIDATION_ERROR') return true
    const message = appErr.message.toLowerCase()
    if (/validation|validate|bad request/i.test(message)) return true
    // Axios 风格的 plain Error：从 response.status 读取
    const axiosErr = err as { response?: { status?: number } }
    if (axiosErr.response?.status === 400) return true
  }
  return false
}
