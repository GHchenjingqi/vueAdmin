// @vitest-environment node
/**
 * X-T04 Feature Flag 机制测试
 *
 * 覆盖：默认关闭（关键新功能）、开启/回滚、未知 key fail-closed、
 * 路由守卫 requireFeature（关闭→403 无副作用，开启→放行）、持久化读取。
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { isFeatureEnabled, listFlags, setFlag, requireFeature, resetFlagsCache } from '../modules/featureflags/featureFlags.js'
import { runInTenant } from '../modules/tenant/context.js'
import { AppError } from '../middleware/errorHandler.js'
import Setting from '../models/Setting.js'

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

/**
 * X-T04 并发与缓存一致性（计划文档 §11 风险回归）。
 * 与上方用例同 worker 串行执行，避免独立测试文件并行抢写同一 Setting 行造成 flake；
 * beforeAll/afterAll 保存并恢复原始 JSON，不污染并行方 dev 联调状态。
 */
describe('X-T04 · setFlag 并发覆盖与缓存一致性', () => {
  const OPTION_KEY = 'feature.flags'
  const keys = ['referral', 'bundle', 'ab_test', 'multi_warehouse', 'blog']
  let original: string | null = null

  const readRaw = async (): Promise<string | null> => {
    const row = await Setting.findOne({ where: { optionKey: OPTION_KEY } })
    return row?.optionValue ?? null
  }
  const readJson = async (): Promise<Record<string, boolean>> => {
    const raw = await readRaw()
    try {
      return JSON.parse(raw ?? '{}') as Record<string, boolean>
    } catch {
      return {}
    }
  }

  beforeAll(async () => {
    original = await readRaw()
  })

  afterEach(async () => {
    await runInTenant({ tenantId: TID }, async () => {
      for (const k of keys) await setFlag(k, false, { id: null, name: 'test' }).catch(() => {})
    })
    resetFlagsCache()
  })

  afterAll(async () => {
    await Setting.upsert({ optionKey: OPTION_KEY, optionValue: original ?? '{}', autoload: 1 } as never)
    resetFlagsCache()
  })

  it('并发写两个不同 key 均保留（后写不覆盖先写）', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await Promise.all([
        setFlag('referral', true, { id: null, name: 'test' }),
        setFlag('bundle', true, { id: null, name: 'test' }),
      ])
      const json = await readJson()
      expect(json.referral).toBe(true)
      expect(json.bundle).toBe(true)
    })
  })

  it('缓存已装载后，外部直改 DB 的 key 不被 setFlag 冲掉', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await isFeatureEnabled('referral') // 装载进程内缓存
      const before = await readJson()
      before.external_probe = true // 未定义 key，不会被其他用例的 flag 重置删除
      await Setting.upsert({ optionKey: OPTION_KEY, optionValue: JSON.stringify(before), autoload: 1 } as never)
      await setFlag('referral', true, { id: null, name: 'test' })
      const after = await readJson()
      expect(after.referral).toBe(true)
      expect(after.external_probe).toBe(true) // 修复前会被旧缓存的全量 JSON 覆盖丢失
    })
  })

  it('setFlag 后无需手动 resetFlagsCache 即可读到最新值', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await setFlag('blog', false, { id: null, name: 'test' })
      expect(await isFeatureEnabled('blog')).toBe(false)
      await setFlag('blog', true, { id: null, name: 'test' })
      expect(await isFeatureEnabled('blog')).toBe(true)
    })
  })

  it('feature.flags 为非法 JSON 时 setFlag 不抛错且能正常写入', async () => {
    await runInTenant({ tenantId: TID }, async () => {
      await Setting.upsert({ optionKey: OPTION_KEY, optionValue: '{not-json', autoload: 1 } as never)
      resetFlagsCache()
      await expect(setFlag('bundle', true, { id: null, name: 'test' }))
        .resolves.toEqual({ key: 'bundle', enabled: true })
      expect(await isFeatureEnabled('bundle')).toBe(true)
    })
  })
})
