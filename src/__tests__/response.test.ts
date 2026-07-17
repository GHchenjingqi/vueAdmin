/**
 * response.ts 单元测试
 * 覆盖：success/fail/paginate/ok、isSuccess、extractData、parseErrorMessage
 */
import { describe, it, expect } from 'vitest'
import { success, fail, paginate, ok, isSuccess, extractData, extractPaginatedData, parseErrorMessage } from '../utils/response'

describe('response.ts - 响应构造', () => {
  describe('success', () => {
    it('创建成功响应', () => {
      const res = success({ id: 1 })
      expect(res.code).toBe(0)
      expect(res.data).toEqual({ id: 1 })
      expect(res.message).toBe('操作成功')
    })

    it('自定义 message', () => {
      const res = success(null, '创建成功')
      expect(res.message).toBe('创建成功')
    })

    it('无数据响应', () => {
      const res = success(undefined)
      expect(res.data).toBeUndefined()
    })
  })

  describe('fail', () => {
    it('创建失败响应', () => {
      const res = fail()
      expect(res.code).toBe(1)
      expect(res.data).toBeNull()
      expect(res.message).toBe('请求失败')
    })

    it('自定义 code 和 message', () => {
      const res = fail('参数错误', 400)
      expect(res.code).toBe(400)
      expect(res.message).toBe('参数错误')
    })
  })

  describe('paginate', () => {
    it('创建分页响应', () => {
      const rows = [{ id: 1 }, { id: 2 }]
      const res = paginate(rows, 100)
      expect(res.code).toBe(0)
      expect(res.data.rows).toEqual(rows)
      expect(res.data.total).toBe(100)
    })

    it('空列表分页', () => {
      const res = paginate([], 0)
      expect(res.data.rows).toEqual([])
      expect(res.data.total).toBe(0)
    })
  })

  describe('ok', () => {
    it('创建空成功响应', () => {
      const res = ok()
      expect(res.code).toBe(0)
      expect(res.data).toBeNull()
      expect(res.message).toBe('操作成功')
    })

    it('自定义 message', () => {
      const res = ok('删除成功')
      expect(res.message).toBe('删除成功')
    })
  })
})

describe('response.ts - 响应判断', () => {
  describe('isSuccess', () => {
    it('code 为 0 时返回 true', () => {
      expect(isSuccess({ code: 0, data: null, message: 'ok' })).toBe(true)
    })

    it('code 非 0 时返回 false', () => {
      expect(isSuccess({ code: 1, data: null, message: 'fail' })).toBe(false)
      expect(isSuccess({ code: 400, data: null, message: 'error' })).toBe(false)
    })
  })
})

describe('response.ts - 数据提取', () => {
  describe('extractData', () => {
    it('成功响应返回 data', () => {
      const res = { code: 0, data: { id: 1, name: 'test' }, message: 'ok' }
      expect(extractData(res)).toEqual({ id: 1, name: 'test' })
    })

    it('失败响应抛出错误', () => {
      const res = { code: 400, data: null, message: '参数错误' }
      expect(() => extractData(res)).toThrow('参数错误')
    })

    it('无 message 时使用默认提示', () => {
      const res = { code: 500, data: null, message: '' }
      expect(() => extractData(res)).toThrow('请求失败')
    })
  })

  describe('extractPaginatedData', () => {
    it('成功响应返回 data', () => {
      const res = { code: 0, data: { rows: [{ id: 1 }], total: 1 } }
      const data = extractPaginatedData(res)
      expect(data.rows).toHaveLength(1)
      expect(data.total).toBe(1)
    })

    it('失败响应抛出错误', () => {
      const res = { code: 401, data: { rows: [], total: 0 }, message: '未授权' }
      expect(() => extractPaginatedData(res)).toThrow('未授权')
    })
  })
})

describe('response.ts - 错误解析', () => {
  describe('parseErrorMessage', () => {
    it('字符串直接返回', () => {
      expect(parseErrorMessage('错误消息')).toBe('错误消息')
    })

    it('从 err.message 提取', () => {
      expect(parseErrorMessage({ message: '错误' })).toBe('错误')
    })

    it('从 err.msg 提取', () => {
      expect(parseErrorMessage({ msg: '失败' })).toBe('失败')
    })

    it('从 err.error 提取', () => {
      expect(parseErrorMessage({ error: '异常' })).toBe('异常')
    })

    it('优先 message > msg > error', () => {
      expect(parseErrorMessage({ message: 'm1', msg: 'm2', error: 'm3' })).toBe('m1')
      expect(parseErrorMessage({ msg: 'm2', error: 'm3' })).toBe('m2')
    })

    it('无法提取时返回默认消息', () => {
      expect(parseErrorMessage(null)).toBe('未知错误')
      expect(parseErrorMessage({})).toBe('未知错误')
      expect(parseErrorMessage(123)).toBe('未知错误')
    })
  })
})
