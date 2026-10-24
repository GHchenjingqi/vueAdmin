import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockAddHook } = vi.hoisted(() => ({
  mockAddHook: vi.fn(),
}))

vi.mock('../config/database.js', () => ({
  default: {
    addHook: mockAddHook,
  },
}))

import { runInTenant } from '../modules/tenant/context.js'
import { registerTenantScope } from '../modules/tenant/hooks/sequelizeTenantScope.js'

describe('tenantScope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('hook logic', () => {
    it('registerTenantScope 注册 beforeFind 和 beforeCreate hooks', () => {
      registerTenantScope()
      expect(mockAddHook).toHaveBeenCalledWith('beforeFind', expect.any(Function))
      expect(mockAddHook).toHaveBeenCalledWith('beforeCreate', expect.any(Function))
    })

    it('beforeFind 非请求上下文不过滤', () => {
      registerTenantScope()
      const beforeFind = mockAddHook.mock.calls.find((c) => c[0] === 'beforeFind')?.[1] as Function
      expect(beforeFind).toBeDefined()

      const Model = { rawAttributes: { tenantId: { type: 'INTEGER' } } }
      const options = { model: Model, where: { status: 1 } }
      beforeFind(options)
      expect(options.where).toEqual({ status: 1 })
    })

    it('无 tenantId 属性的模型不过滤', () => {
      registerTenantScope()
      const beforeFind = mockAddHook.mock.calls.find((c) => c[0] === 'beforeFind')?.[1] as Function
      expect(beforeFind).toBeDefined()

      const Model = { rawAttributes: { name: { type: 'STRING' } } }
      const options = { model: Model, where: {} }
      beforeFind(options)
      expect(options.where).toEqual({})
    })
  })
})
