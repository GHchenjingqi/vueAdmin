import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildAddressPayload,
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  type AddressForm,
} from '../../shared/customer/address'

/**
 * P4-T02 地址簿前端接线单测：
 * 载荷净化（国家码大写 / 空值 / 越权字段剥离）、请求路径与方法、Bearer 鉴权、响应解包与错误透传。
 */
const form: AddressForm = {
  fullName: '  Alice ',
  phone: '+1 555 0100',
  country: 'us',
  province: 'CA',
  city: 'Los Angeles',
  address1: '1 Main St',
  address2: '',
  postcode: '90001',
  isDefault: true,
}

interface CallInit {
  method?: string
  headers?: Record<string, string>
  body?: string
}

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async (_url: string, _init?: CallInit) => ({ ok, status, text: async () => JSON.stringify(body) }))
  vi.stubGlobal('fetch', fn)
  return fn
}

type MockFetch = ReturnType<typeof mockFetch>
const urlOf = (fn: MockFetch, i: number): string => fn.mock.calls[i]?.[0] ?? ''
const initOf = (fn: MockFetch, i: number): CallInit => (fn.mock.calls[i]?.[1] ?? {}) as CallInit

beforeEach(() => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', { getItem: (key: string) => (key === 'sb_customer_token' ? 'tok_test' : null) })
})

afterEach(() => vi.unstubAllGlobals())

describe('地址载荷净化', () => {
  it('trim 字段、国家码大写、空 address2 → null，且不携带归属字段', () => {
    const out = buildAddressPayload({ ...form, customerId: 99, tenantId: 2 } as AddressForm)
    expect(out.fullName).toBe('Alice')
    expect(out.country).toBe('US')
    expect(out.address2).toBeNull()
    expect(out.isDefault).toBe(true)
    expect(out.customerId).toBeUndefined()
    expect(out.tenantId).toBeUndefined()
  })

  it('局部更新只提交非空字段', () => {
    expect(buildAddressPayload({ city: '  San Francisco ' }, true)).toEqual({ city: 'San Francisco' })
    expect(buildAddressPayload({ city: '   ' }, true)).toEqual({})
  })
})

describe('地址 API 接线', () => {
  it('列表走 GET /api/addresses 且带 Bearer，兼容 BFF 裸数据', async () => {
    const fn = mockFetch([{ id: 7, isDefault: true }])
    expect(await listAddresses()).toEqual([{ id: 7, isDefault: true }])
    expect(urlOf(fn, 0)).toBe('/api/addresses')
    expect(initOf(fn, 0).headers?.authorization).toBe('Bearer tok_test')
    expect(initOf(fn, 0).method).toBe('GET')
  })

  it('兼容后端 {code:0,data} 信封', async () => {
    mockFetch({ code: 0, data: { id: 8, isDefault: true } })
    expect((await createAddress(form)).id).toBe(8)
  })

  it('新增 / 编辑 / 删除 / 设默认的路径与 HTTP 方法正确', async () => {
    const fn = mockFetch({ id: 3 })
    await createAddress(form)
    await updateAddress(3, { city: 'SF' })
    await deleteAddress(3)
    await setDefaultAddress(3)
    expect([0, 1, 2, 3].map((i) => [urlOf(fn, i), initOf(fn, i).method])).toEqual([
      ['/api/addresses', 'POST'],
      ['/api/addresses/3', 'PATCH'],
      ['/api/addresses/3', 'DELETE'],
      ['/api/addresses/3/default', 'POST'],
    ])
    const created = JSON.parse(initOf(fn, 0).body ?? '{}')
    expect(created.country).toBe('US')
    expect(created.customerId).toBeUndefined()
    expect(JSON.parse(initOf(fn, 1).body ?? '{}')).toEqual({ city: 'SF' })
  })

  it('业务错误透传 message；未登录不发请求', async () => {
    mockFetch({ code: 404, message: '地址不存在' }, false, 404)
    await expect(listAddresses()).rejects.toThrow('地址不存在')

    vi.stubGlobal('localStorage', { getItem: () => null })
    const fn = mockFetch([])
    await expect(listAddresses()).rejects.toThrow('请先登录')
    expect(fn).not.toHaveBeenCalled()
  })
})
