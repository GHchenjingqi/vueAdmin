/**
 * errors.ts 单元测试
 *
 * 覆盖全局应用错误类与错误转换工具：
 * - AppError 构造、isRetryable / isAuthError 派生属性
 * - createAppError：网络错误、HTTP 状态码、业务消息映射
 * - getErrorMessage：AppError / Error / string / 普通对象
 * - isUserCancel / isNetworkError / isAuthError / isValidationError 判定
 *
 * 该文件是 src/utils/error.ts 的纯逻辑实现来源（error.ts 仅为重导出），
 * 补充后可消除 error.ts 的覆盖率假阴性。
 */
import { describe, it, expect } from 'vitest'
import { AppError, createAppError, getErrorMessage, isUserCancel, isNetworkError, isAuthError, isValidationError } from '../utils/errors'

describe('errors.ts - AppError', () => {
  it('默认 code 为 UNKNOWN', () => {
    const e = new AppError('boom')
    expect(e.message).toBe('boom')
    expect(e.name).toBe('AppError')
    expect(e.code).toBe('UNKNOWN')
    expect(e.status).toBeUndefined()
  })

  it('携带 code / status / details', () => {
    const e = new AppError('没权限', 'FORBIDDEN', 403, { role: 'guest' })
    expect(e.code).toBe('FORBIDDEN')
    expect(e.status).toBe(403)
    expect(e.details).toEqual({ role: 'guest' })
  })

  it('isRetryable 仅网络/超时/服务端错误为真', () => {
    expect(new AppError('a', 'NETWORK_ERROR').isRetryable).toBe(true)
    expect(new AppError('a', 'TIMEOUT').isRetryable).toBe(true)
    expect(new AppError('a', 'SERVER_ERROR').isRetryable).toBe(true)
    expect(new AppError('a', 'UNAUTHORIZED').isRetryable).toBe(false)
    expect(new AppError('a', 'VALIDATION_ERROR').isRetryable).toBe(false)
  })

  it('isAuthError 由 code 决定', () => {
    expect(new AppError('a', 'UNAUTHORIZED').isAuthError).toBe(true)
    expect(new AppError('a', 'FORBIDDEN').isAuthError).toBe(false)
  })
})

describe('errors.ts - createAppError', () => {
  it('已是 AppError 则原样返回', () => {
    const original = new AppError('hi', 'NOT_FOUND', 404)
    expect(createAppError(original)).toBe(original)
  })

  it('无 response 视为网络错误', () => {
    const e = createAppError({ message: 'Network Error' })
    expect(e).toBeInstanceOf(AppError)
    expect(e.code).toBe('NETWORK_ERROR')
  })

  it('无 response 且有 axios code 映射', () => {
    expect(createAppError({ code: 'ECONNABORTED', message: 'x' }).code).toBe('TIMEOUT')
    expect(createAppError({ code: 'ECONNREFUSED', message: 'x' }).code).toBe('NETWORK_ERROR')
    expect(createAppError({ code: 'ENOTFOUND', message: 'x' }).code).toBe('NETWORK_ERROR')
  })

  it('HTTP 状态码映射到对应 ErrorCode', () => {
    expect(createAppError({ response: { status: 400 } }).code).toBe('VALIDATION_ERROR')
    expect(createAppError({ response: { status: 401 } }).code).toBe('UNAUTHORIZED')
    expect(createAppError({ response: { status: 403 } }).code).toBe('FORBIDDEN')
    expect(createAppError({ response: { status: 404 } }).code).toBe('NOT_FOUND')
    expect(createAppError({ response: { status: 500 } }).code).toBe('SERVER_ERROR')
    expect(createAppError({ response: { status: 502 } }).code).toBe('SERVER_ERROR')
  })

  it('未知状态码回退 UNKNOWN', () => {
    expect(createAppError({ response: { status: 418 } }).code).toBe('UNKNOWN')
  })

  it('优先使用业务消息，否则使用 HTTP 文案', () => {
    expect(createAppError({ response: { status: 500, data: { message: '数据库炸了' } } }).message).toBe('数据库炸了')
    expect(createAppError({ response: { status: 403, data: {} } }).message).toBe('您没有权限执行此操作')
    expect(createAppError({ response: { status: 404, data: {} } }).message).toBe('请求的资源不存在')
  })

  it('无消息时回退到默认提示', () => {
    const e = createAppError({ response: { status: 418, data: {} } })
    expect(e.message).toBe('请求失败')
  })

  it('携带原始 response.data 作为 details', () => {
    const data = { message: 'x', traceId: 'abc' }
    expect(createAppError({ response: { status: 500, data } }).details).toBe(data)
  })
})

describe('errors.ts - getErrorMessage', () => {
  it('AppError 返回 message', () => {
    expect(getErrorMessage(new AppError('自定义错误'))).toBe('自定义错误')
  })

  it('Error 返回 message', () => {
    expect(getErrorMessage(new Error('标准错误'))).toBe('标准错误')
  })

  it('string 直接返回', () => {
    expect(getErrorMessage('纯文本')).toBe('纯文本')
  })

  it('带 message 的普通对象', () => {
    expect(getErrorMessage({ message: '对象消息' })).toBe('对象消息')
  })

  it('无 message 的对象返回未知错误', () => {
    expect(getErrorMessage({ foo: 1 })).toBe('未知错误')
  })

  it('null / undefined 返回未知错误', () => {
    expect(getErrorMessage(null)).toBe('未知错误')
    expect(getErrorMessage(undefined)).toBe('未知错误')
  })
})

describe('errors.ts - isUserCancel', () => {
  it('字符串 cancel', () => {
    expect(isUserCancel('cancel')).toBe(true)
  })
  it('Error message 为 cancel', () => {
    expect(isUserCancel(new Error('cancel'))).toBe(true)
  })
  it('其它错误为 false', () => {
    expect(isUserCancel(new Error('x'))).toBe(false)
    expect(isUserCancel(null)).toBe(false)
  })
})

describe('errors.ts - isNetworkError', () => {
  it('命中关键字', () => {
    expect(isNetworkError(new Error('network timeout'))).toBe(true)
    expect(isNetworkError(new Error('ECONNREFUSED'))).toBe(true)
    expect(isNetworkError('connection failed')).toBe(true)
  })
  it('非网络错误', () => {
    expect(isNetworkError(new Error('bad request'))).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})

describe('errors.ts - isAuthError', () => {
  it('AppError status 401/403', () => {
    expect(isAuthError(new AppError('a', 'UNAUTHORIZED', 401))).toBe(true)
    expect(isAuthError(new AppError('a', 'FORBIDDEN', 403))).toBe(true)
    expect(isAuthError(new AppError('a', 'NOT_FOUND', 404))).toBe(false)
  })
  it('AppError code 判定', () => {
    expect(isAuthError(new AppError('a', 'UNAUTHORIZED'))).toBe(true)
    expect(isAuthError(new AppError('a', 'FORBIDDEN'))).toBe(true)
  })
  it('Axios 风格 plain Error', () => {
    expect(isAuthError({ response: { status: 401 } } as unknown as Error)).toBe(true)
    expect(isAuthError({ response: { status: 403 } } as unknown as Error)).toBe(true)
  })
  it('空值返回 false', () => {
    expect(isAuthError(null)).toBe(false)
  })
})

describe('errors.ts - isValidationError', () => {
  it('status 400', () => {
    expect(isValidationError(new AppError('a', 'VALIDATION_ERROR', 400))).toBe(true)
  })
  it('code VALIDATION_ERROR', () => {
    expect(isValidationError(new AppError('a', 'VALIDATION_ERROR'))).toBe(true)
  })
  it('message 含 validation/bad request', () => {
    expect(isValidationError(new Error('bad request body'))).toBe(true)
    expect(isValidationError(new Error('validation failed'))).toBe(true)
  })
  it('Axios 风格 status 400', () => {
    expect(isValidationError({ response: { status: 400 } } as unknown as Error)).toBe(true)
  })
  it('其它错误为 false', () => {
    expect(isValidationError(new AppError('a', 'NOT_FOUND', 404))).toBe(false)
    expect(isValidationError(null)).toBe(false)
  })
})
