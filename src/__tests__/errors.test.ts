/**
 * errors.ts 单元测试
 * 覆盖：AppError 类、createAppError、getErrorMessage、isUserCancel
 */
import { describe, it, expect } from 'vitest'
import { AppError, createAppError, getErrorMessage, isUserCancel } from '../utils/errors'

describe('errors.ts - AppError', () => {
  it('创建基本 AppError', () => {
    const err = new AppError('测试错误')
    expect(err.message).toBe('测试错误')
    expect(err.code).toBe('UNKNOWN')
    expect(err.name).toBe('AppError')
  })

  it('创建带 code 的 AppError', () => {
    const err = new AppError('未授权', 'UNAUTHORIZED', 401)
    expect(err.code).toBe('UNAUTHORIZED')
    expect(err.status).toBe(401)
  })

  it('创建带 details 的 AppError', () => {
    const details = { field: 'username', reason: 'required' }
    const err = new AppError('验证失败', 'VALIDATION_ERROR', 400, details)
    expect(err.details).toEqual(details)
  })

  describe('isRetryable', () => {
    it('NETWORK_ERROR 可重试', () => {
      const err = new AppError('网络错误', 'NETWORK_ERROR')
      expect(err.isRetryable).toBe(true)
    })

    it('TIMEOUT 可重试', () => {
      const err = new AppError('超时', 'TIMEOUT')
      expect(err.isRetryable).toBe(true)
    })

    it('SERVER_ERROR 可重试', () => {
      const err = new AppError('服务器错误', 'SERVER_ERROR')
      expect(err.isRetryable).toBe(true)
    })

    it('UNAUTHORIZED 不可重试', () => {
      const err = new AppError('未授权', 'UNAUTHORIZED')
      expect(err.isRetryable).toBe(false)
    })

    it('BUSINESS_ERROR 不可重试', () => {
      const err = new AppError('业务错误', 'BUSINESS_ERROR')
      expect(err.isRetryable).toBe(false)
    })
  })

  describe('isAuthError', () => {
    it('UNAUTHORIZED 是认证错误', () => {
      const err = new AppError('未授权', 'UNAUTHORIZED')
      expect(err.isAuthError).toBe(true)
    })

    it('其他错误不是认证错误', () => {
      const err = new AppError('禁止访问', 'FORBIDDEN')
      expect(err.isAuthError).toBe(false)
    })
  })
})

describe('errors.ts - createAppError', () => {
  it('AppError 直接返回', () => {
    const original = new AppError('原始错误', 'BUSINESS_ERROR')
    const result = createAppError(original)
    expect(result).toBe(original)
  })

  it('无响应的网络错误（ERR_NETWORK）', () => {
    const axiosErr = { code: 'ERR_NETWORK', message: 'Network Error' }
    const result = createAppError(axiosErr)
    expect(result.code).toBe('NETWORK_ERROR')
    expect(result.message).toBe('Network Error')
  })

  it('超时错误（ECONNABORTED）', () => {
    const axiosErr = { code: 'ECONNABORTED', message: 'timeout of 15000ms exceeded' }
    const result = createAppError(axiosErr)
    expect(result.code).toBe('TIMEOUT')
  })

  it('401 错误', () => {
    const axiosErr = {
      response: { status: 401, data: { message: 'Token expired' } },
    }
    const result = createAppError(axiosErr)
    expect(result.code).toBe('UNAUTHORIZED')
    expect(result.status).toBe(401)
    expect(result.message).toBe('Token expired')
  })

  it('403 错误', () => {
    const axiosErr = {
      response: { status: 403, data: {} },
    }
    const result = createAppError(axiosErr)
    expect(result.code).toBe('FORBIDDEN')
    expect(result.message).toBe('您没有权限执行此操作')
  })

  it('404 错误', () => {
    const axiosErr = {
      response: { status: 404, data: {} },
    }
    const result = createAppError(axiosErr)
    expect(result.code).toBe('NOT_FOUND')
    expect(result.message).toBe('请求的资源不存在')
  })

  it('500 错误', () => {
    const axiosErr = {
      response: { status: 500, data: { message: 'Internal Server Error' } },
    }
    const result = createAppError(axiosErr)
    expect(result.code).toBe('SERVER_ERROR')
    expect(result.message).toBe('Internal Server Error')
  })

  it('未知 HTTP 状态码', () => {
    const axiosErr = {
      response: { status: 418, data: {} },
    }
    const result = createAppError(axiosErr)
    expect(result.code).toBe('UNKNOWN')
  })

  it('无 message 时使用默认提示', () => {
    const axiosErr = {
      response: { status: 401, data: {} },
    }
    const result = createAppError(axiosErr)
    expect(result.message).toBe('登录已过期，请重新登录')
  })
})

describe('errors.ts - getErrorMessage', () => {
  it('AppError 返回 message', () => {
    const err = new AppError('应用错误')
    expect(getErrorMessage(err)).toBe('应用错误')
  })

  it('Error 返回 message', () => {
    const err = new Error('标准错误')
    expect(getErrorMessage(err)).toBe('标准错误')
  })

  it('字符串直接返回', () => {
    expect(getErrorMessage('字符串错误')).toBe('字符串错误')
  })

  it('其他类型返回默认消息', () => {
    expect(getErrorMessage(null)).toBe('未知错误')
    expect(getErrorMessage(undefined)).toBe('未知错误')
    expect(getErrorMessage({})).toBe('未知错误')
  })
})

describe('errors.ts - isUserCancel', () => {
  it('字符串 cancel 为用户取消', () => {
    expect(isUserCancel('cancel')).toBe(true)
  })

  it('message 为 cancel 的 Error 为用户取消', () => {
    const err = new Error('cancel')
    expect(isUserCancel(err)).toBe(true)
  })

  it('其他错误不是用户取消', () => {
    expect(isUserCancel(new Error('other'))).toBe(false)
    expect(isUserCancel(null)).toBe(false)
    expect(isUserCancel('other')).toBe(false)
  })
})
