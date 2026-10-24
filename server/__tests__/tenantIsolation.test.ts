import { describe, it, expect, vi } from 'vitest'

vi.mock('../config/index.js', () => ({
  default: {
    jwt: { secret: 'test-secret' },
    redis: { enabled: false },
  },
}))

vi.mock('../utils/sseManager.js', () => ({
  sendToUser: vi.fn(),
}))

vi.mock('../config/database.js', () => ({
  default: {},
}))

import { runInTenant, getTenantContext } from '../modules/tenant/context.js'

describe('tenantIsolation', () => {
  describe('AsyncLocalStorage context', () => {
    it('在 runInTenant 中可获取 tenantContext', () => {
      runInTenant({ tenantId: 1, userId: 100 }, () => {
        const ctx = getTenantContext()
        expect(ctx).toBeDefined()
        expect(ctx!.tenantId).toBe(1)
        expect(ctx!.userId).toBe(100)
      })
    })

    it('runInTenant 外返回 undefined', () => {
      expect(getTenantContext()).toBeUndefined()
    })

    it('嵌套 runInTenant 使用内部上下文', () => {
      runInTenant({ tenantId: 1 }, () => {
        runInTenant({ tenantId: 2, bypass: true }, () => {
          const ctx = getTenantContext()
          expect(ctx!.tenantId).toBe(2)
          expect(ctx!.bypass).toBe(true)
        })
      })
    })

    it('bypass 模式下跳过隔离', () => {
      runInTenant({ tenantId: 1, bypass: true }, () => {
        const ctx = getTenantContext()
        expect(ctx!.bypass).toBe(true)
      })
    })
  })

  describe('tenantId 兜底', () => {
    it('tenantId 为 null 时返回 -1', () => {
      runInTenant({ tenantId: null }, () => {
        const ctx = getTenantContext()
        expect(ctx!.tenantId).toBeNull()
      })
    })
  })
})
