// @vitest-environment node
/**
 * P5-T08 A/B 实验框架测试
 *
 * 覆盖：确定性分桶与权重分布、未知实验/空 subject fail-closed、
 * ab_test flag 关闭态降级 control 且**零副作用**（曝光 hook 不触发）、
 * 开启态分派生效并触发曝光、一键关闭、实验定义权重校验边界、admin 清单。
 *
 * 说明：flag 状态用 vi.mock 控制而非真实 setFlag —— X-T04 的 setFlag 对
 * Setting('feature.flags') 做全量 JSON 读改写，多测试文件并发时会互相覆盖；
 * 这里不写 DB，保证跨文件零干扰。真实开关/持久化路径由 featureFlags.test.ts 覆盖。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isFeatureEnabled } from '../modules/featureflags/featureFlags.js'
import {
  EXPERIMENTS, assertValidDef, assignVariant, bucketOf, listExperiments, resolveAssignment,
} from '../modules/experiments/experimentService.js'

vi.mock('../modules/featureflags/featureFlags.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/featureflags/featureFlags.js')>()
  return { ...actual, isFeatureEnabled: vi.fn(async () => false) }
})

const flagMock = vi.mocked(isFeatureEnabled)

beforeEach(() => {
  flagMock.mockReset()
  flagMock.mockResolvedValue(false)
})

describe('P5-T08 分桶算法', () => {
  it('同一 subject 恒定；桶号落在 0..99', () => {
    const def = EXPERIMENTS[0]
    const first = assignVariant(def, 'customer-42')
    for (let i = 0; i < 100; i++) {
      expect(assignVariant(def, 'customer-42')).toBe(first)
      expect(bucketOf(def.key, `s${i}`)).toBeGreaterThanOrEqual(0)
      expect(bucketOf(def.key, `s${i}`)).toBeLessThan(100)
    }
  })

  it('权重分布近似（1000 subjects，各 variant 偏差 <8%）', () => {
    const def = EXPERIMENTS[1]
    const counts: Record<string, number> = {}
    for (let i = 0; i < 1000; i++) {
      const v = assignVariant(def, `s-${i}`)
      counts[v] = (counts[v] ?? 0) + 1
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    expect(total).toBe(1000)
    for (const variant of def.variants) {
      expect(Math.abs((counts[variant.id] ?? 0) / 10 - variant.weight)).toBeLessThan(8)
    }
  })

  it('实验定义校验：权重和≠100 / 无 control / 非整数权重均抛错', () => {
    expect(() => assertValidDef({ key: 'a', description: '', variants: [{ id: 'control', weight: 60 }] }))
      .toThrow(/100/)
    expect(() => assertValidDef({ key: 'a', description: '', variants: [{ id: 'v1', weight: 100 }] }))
      .toThrow(/control/)
    expect(() => assertValidDef({ key: 'a', description: '', variants: [{ id: 'control', weight: 33.5 }, { id: 'v1', weight: 66.5 }] }))
      .toThrow(/正整数/)
    expect(() => EXPERIMENTS.forEach(assertValidDef)).not.toThrow()
  })

  it('listExperiments 返回全部定义并标注 ab_test flag', () => {
    const list = listExperiments()
    expect(list.length).toBe(EXPERIMENTS.length)
    for (const d of list) expect(d.flag).toBe('ab_test')
  })
})

describe('P5-T08 flag 联动与零副作用', () => {
  it('ab_test 关闭：降级 control、enabled=false，且曝光 hook 不被调用', async () => {
    const exposure = vi.fn()
    const a = await resolveAssignment('checkout_cta', 'customer-42', { exposure })
    expect(a).toMatchObject({ enabled: false, variant: 'control', reason: 'feature_disabled' })
    expect(flagMock).toHaveBeenCalledWith('ab_test')
    expect(exposure).not.toHaveBeenCalled()
  })

  it('ab_test 开启：分派生效、曝光 hook 触发一次，结果稳定', async () => {
    flagMock.mockResolvedValue(true)
    const exposure = vi.fn()
    const a = await resolveAssignment('checkout_cta', 'customer-42', { exposure })
    expect(a.enabled).toBe(true)
    expect(a.reason).toBe('assigned')
    expect(a.variant).toBe(assignVariant(EXPERIMENTS[0], 'customer-42'))
    expect(exposure).toHaveBeenCalledTimes(1)
    expect(exposure).toHaveBeenCalledWith({ key: 'checkout_cta', subjectId: 'customer-42', variant: a.variant })
    const b = await resolveAssignment('checkout_cta', 'customer-42')
    expect(b.variant).toBe(a.variant)
  })

  it('开启态下未知实验 / 空 subjectId 仍 fail-closed 降级 control', async () => {
    flagMock.mockResolvedValue(true)
    const exposure = vi.fn()
    const unknown = await resolveAssignment('no_such_experiment', 's1', { exposure })
    expect(unknown).toMatchObject({ variant: 'control', reason: 'unknown_experiment' })
    const missing = await resolveAssignment('checkout_cta', undefined, { exposure })
    expect(missing).toMatchObject({ variant: 'control', reason: 'missing_subject' })
    expect(exposure).not.toHaveBeenCalled()
  })

  it('一键关闭：开启后关闭，立即全部回到 control 且零副作用', async () => {
    flagMock.mockResolvedValue(true)
    expect((await resolveAssignment('checkout_cta', 'customer-42')).enabled).toBe(true)
    flagMock.mockResolvedValue(false)
    const exposure = vi.fn()
    for (const key of ['checkout_cta', 'product_recommendation']) {
      const a = await resolveAssignment(key, 'customer-42', { exposure })
      expect(a).toMatchObject({ enabled: false, variant: 'control' })
    }
    expect(exposure).not.toHaveBeenCalled()
  })
})
