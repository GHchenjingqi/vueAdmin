// @vitest-environment node
/**
 * X-T04 Feature Flag 机制测试
 *
 * 覆盖：默认关闭（关键新功能）、开启/回滚、未知 key fail-closed、
 * 路由守卫 requireFeature（关闭→403 无副作用，开启→放行）、持久化读取。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { isFeatureEnabled, listFlags, setFlag, requireFeature, resetFlagsCache } from '../modules/featureflags/featureFlags.js'
import { runInTenant } from '../modules/tenant/context.js'
import { AppError } from '../middleware/errorHandler.js'

const TID = 1

beforeEach(async () => {
  resetFlagsCache()
  await runInTenant({ tenantId: TID }, async () => {
    await setFlag('referral', false, { id: null, name: 'test' }).catch(() => {})
    await setFlag('blog', false, { id: null, name: 'test' }).catch(() => {})
  })
  resetFlagsCache()
})

afterEach(() => resetFlagsCache())

describe('X-T04 Feature Flag', () => {
  it('关键新功能默认关闭（defaultEnabled=false）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      expect(await isFeatureEnabled('referral')).toBe(false)
      expect(await isFeatureEnabled('bundle')).toBe(false)
      expect(await isFeatureEnabled('ab_test')).toBe(false)
      expect(await isFeatureEnabled('multi_warehouse')).toBe(false)
      expect(await isFeatureEnabled('blog')).toBe(false)
    })
  })

  it('开启后生效，回滚后恢复关闭（无副作用验证由守卫测试承担）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      expect(await isFeatureEnabled('referral')).toBe(false)
      await setFlag('referral', true, { id: 1, name: 'admin' })
      expect(await isFeatureEnabled('referral')).toBe(true)
      await setFlag('referral', false, { id: 1, name: 'admin' })
      expect(await isFeatureEnabled('referral')).toBe(false)
    })
  })

  it('未知 flag → false（fail-closed），不抛错', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      expect(await isFeatureEnabled('no_such_flag')).toBe(false)
    })
  })

  it('listFlags 返回全部定义与启用态', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      const flags = await listFlags()
      expect(flags.length).toBeGreaterThanOrEqual(5)
      for (const f of flags) {
        expect(typeof f.key).toBe('string')
        expect(typeof f.enabled).toBe('boolean')
      }
    })
  })

  it('设置未知 flag → FLAG_NOT_FOUND', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await expect(setFlag('no_such_flag', true, { id: 1, name: 'admin' }))
        .rejects.toMatchObject({ statusCode: 404, message: expect.stringContaining('FLAG_NOT_FOUND') })
    })
  })

  it('requireFeature：关闭 → 403 FEATURE_DISABLED，不放行；开启 → 放行', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await setFlag('referral', false, { id: 1, name: 'admin' })
      resetFlagsCache()

      let nextErr: unknown = null
      let nextCalled = false
      const guard = requireFeature('referral')
      await guard({} as Request, {} as Response, ((err?: unknown) => { if (err) nextErr = err; else nextCalled = true }) as NextFunction)
      expect(nextErr).toBeInstanceOf(AppError)
      expect((nextErr as AppError).statusCode).toBe(403)
      expect((nextErr as AppError).message).toContain('FEATURE_DISABLED')
      expect(nextCalled).toBe(false)

      await setFlag('referral', true, { id: 1, name: 'admin' })
      resetFlagsCache()
      nextErr = null
      nextCalled = false
      const guard2 = requireFeature('referral')
      await guard2({} as Request, {} as Response, ((err?: unknown) => { if (err) nextErr = err; else nextCalled = true }) as NextFunction)
      expect(nextErr).toBeNull()
      expect(nextCalled).toBe(true)
    })
  })
})
