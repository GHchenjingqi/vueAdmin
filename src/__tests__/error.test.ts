/**
 * error.ts 单元测试
 */
import { describe, it, expect } from 'vitest'
import { getErrorMessage, isNetworkError, isAuthError, isValidationError } from '../utils/error'

describe('error.ts', () => {
  describe('getErrorMessage', () => {
    it('返回 Error 对象的 message', () => {
      const error = new Error('test error')
      expect(getErrorMessage(error)).toBe('test error')
    })

    it('返回字符串本身', () => {
      expect(getErrorMessage('string error')).toBe('string error')
    })

    it('返回未知错误消息', () => {
      expect(getErrorMessage(null)).toBe('未知错误')
      expect(getErrorMessage(undefined)).toBe('未知错误')
    })

    it('返回空对象的消息', () => {
      expect(getErrorMessage({})).toBe('未知错误')
    })

    it('处理对象带 message 属性', () => {
      expect(getErrorMessage({ message: 'custom message' })).toBe('custom message')
    })
  })

  describe('isNetworkError', () => {
    it('识别网络错误', () => {
      const networkError = new Error('Network request failed')
      expect(isNetworkError(networkError)).toBe(true)
    })

    it('识别 fetch 错误', () => {
      const fetchError = new Error('Failed to fetch')
      expect(isNetworkError(fetchError)).toBe(true)
    })

    it('非网络错误返回 false', () => {
      const normalError = new Error('Some other error')
      expect(isNetworkError(normalError)).toBe(false)
    })

    it('null/undefined 返回 false', () => {
      expect(isNetworkError(null)).toBe(false)
      expect(isNetworkError(undefined)).toBe(false)
    })
  })

  describe('isAuthError', () => {
    it('识别认证错误（401）', () => {
      const authError = new Error('Unauthorized')
      ;(authError as any).response = { status: 401 }
      expect(isAuthError(authError)).toBe(true)
    })

    it('识别授权错误（403）', () => {
      const authError = new Error('Forbidden')
      ;(authError as any).response = { status: 403 }
      expect(isAuthError(authError)).toBe(true)
    })

    it('非认证错误返回 false', () => {
      const normalError = new Error('Some error')
      expect(isAuthError(normalError)).toBe(false)
    })

    it('无 response 属性的错误返回 false', () => {
      const error = new Error('No response')
      expect(isAuthError(error)).toBe(false)
    })
  })

  describe('isValidationError', () => {
    it('识别验证错误（400）', () => {
      const validationError = new Error('Bad Request')
      ;(validationError as any).response = { status: 400 }
      expect(isValidationError(validationError)).toBe(true)
    })

    it('识别验证错误消息', () => {
      const validationError = new Error('Validation failed')
      expect(isValidationError(validationError)).toBe(true)
    })

    it('非验证错误返回 false', () => {
      const normalError = new Error('Some error')
      expect(isValidationError(normalError)).toBe(false)
    })
  })
})
