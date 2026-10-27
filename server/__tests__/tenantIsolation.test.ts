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
import { currentTenantConstraint, applyCurrentTenantScope } from '../modules/tenant/scope.js'

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

  describe('scope 助手（列表/详情接口用）', () => {
    it('普通租户返回 tenantId 约束', () => {
      runInTenant({ tenantId: 2, userId: 1 }, () => {
        expect(currentTenantConstraint()).toEqual({ tenantId: 2 })
      })
    })

    it('平台超管（bypass）返回 null（不约束）', () => {
      runInTenant({ tenantId: 2, userId: 1, bypass: true }, () => {
        expect(currentTenantConstraint()).toBeNull()
      })
    })

    it('无上下文返回 null（定时任务/脚本不约束）', () => {
      expect(currentTenantConstraint()).toBeNull()
    })

    it('tenantId 缺失时兜底 -1（不匹配任何行）', () => {
      runInTenant({ tenantId: null, userId: 1 }, () => {
        expect(currentTenantConstraint()).toEqual({ tenantId: -1 })
      })
    })

    it('applyCurrentTenantScope 原地合并进 where 且保留既有条件', () => {
      const where: Record<string, any> = { status: 'running' }
      runInTenant({ tenantId: 2, userId: 1 }, () => {
        const merged = applyCurrentTenantScope(where)
        expect(merged).toBe(where)
        expect(where).toEqual({ status: 'running', tenantId: 2 })
      })
    })

    it('applyCurrentTenantScope 在 bypass 时不动 where', () => {
      const where: Record<string, any> = { status: 'running' }
      runInTenant({ tenantId: 2, userId: 1, bypass: true }, () => {
        applyCurrentTenantScope(where)
        expect(where).toEqual({ status: 'running' })
      })
    })
  })
})
