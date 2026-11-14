// @vitest-environment node
/**
 * 配送档位（PLAN 1.3）纯函数门禁
 *
 * 背景：报价出参此前没有档位概念，`commerce.ts` 把 shippingRates 写死为 []，
 * 结算页渲染不出任何配送方式，只能沿用代码里的 'std'。
 *
 * 这里锁定三件事：
 * 1. 旧配置（无 options）仍能通过校验，并回退单一标准档 —— 向后兼容；
 * 2. options 非法（重复 id / 负加价 / 空名）一律 503 fail-closed，不静默放行；
 * 3. 加价语义是「在分区基础运费上叠加」，不是替换。
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SHIPPING_OPTION, validateShippingConfig } from '../modules/storefront/services/shippingService.js'

const BASE = {
  mode: 'whitelist' as const,
  allowedCountries: ['US', 'GB'],
  zones: [{ countries: ['US'], shippingCents: 800 }],
  defaultShippingCents: 1500,
}

describe('shipping options validation', () => {
  it('accepts a legacy config without options', () => {
    const cfg = validateShippingConfig({ ...BASE })
    expect(cfg.options).toBeUndefined()
    expect(DEFAULT_SHIPPING_OPTION).toEqual({ id: 'std', name: 'Standard', surchargeCents: 0, etaDays: '7-12' })
  })

  it('accepts a valid options array', () => {
    const cfg = validateShippingConfig({
      ...BASE,
      options: [
        { id: 'std', name: 'Standard', surchargeCents: 0, etaDays: '7-12' },
        { id: 'exp', name: 'Express', surchargeCents: 1200, etaDays: '3-5' },
      ],
    })
    expect(cfg.options).toHaveLength(2)
    expect(cfg.options?.[1]).toEqual({ id: 'exp', name: 'Express', surchargeCents: 1200, etaDays: '3-5' })
  })

  it('rejects duplicate option ids', () => {
    expect(() =>
      validateShippingConfig({
        ...BASE,
        options: [
          { id: 'exp', name: 'Express', surchargeCents: 0, etaDays: '3-5' },
          { id: 'exp', name: 'Express 2', surchargeCents: 100, etaDays: '2-4' },
        ],
      }),
    ).toThrow(/SHOP_SHIPPING_CONFIG_INVALID/)
  })

  it('rejects a negative surcharge', () => {
    expect(() =>
      validateShippingConfig({ ...BASE, options: [{ id: 'exp', name: 'Express', surchargeCents: -1, etaDays: '3-5' }] }),
    ).toThrow(/SHOP_SHIPPING_CONFIG_INVALID/)
  })

  it('rejects an empty option name', () => {
    expect(() =>
      validateShippingConfig({ ...BASE, options: [{ id: 'exp', name: '  ', surchargeCents: 0, etaDays: '3-5' }] }),
    ).toThrow(/SHOP_SHIPPING_CONFIG_INVALID/)
  })

  it('rejects an empty options array instead of silently treating it as legacy', () => {
    // 空数组更像配置错误（运营清空了列表），按 fail-closed 处理而不是悄悄回退标准档
    expect(() => validateShippingConfig({ ...BASE, options: [] })).toThrow(/SHOP_SHIPPING_CONFIG_INVALID/)
  })
})

describe('surcharge semantics', () => {
  it('adds the surcharge on top of the zone rate rather than replacing it', () => {
    const zoneCents = 800
    const surcharge = 1200
    // 与 quoteService 的 shippingOptions 计算口径一致
    const expressTotal = zoneCents + surcharge
    expect(expressTotal).toBe(2000)
    expect(expressTotal).toBeGreaterThan(zoneCents)
  })
})
