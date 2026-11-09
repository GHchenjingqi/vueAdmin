import { describe, expect, it } from 'vitest'
import { buildCartLineAttrs, CART_LINE_ATTR_ORDER } from '../../shared/commerce/cart-line'

/**
 * 购物车行属性摘要（修复"加购信息不全"）：
 * - apparel 完整 spec 显示 Size System/Size/Color/Fabric（旧代码丢失）。
 * - wig 完整 spec 显示 Texture/LaceType/Length/Density/CapSize/Glueless 等。
 * - 过滤 spec 中无值项；顺序固定；不显示长描述字段。
 */
describe('buildCartLineAttrs (cart line attribute summary)', () => {
  it('shows all key apparel attributes (sizeSystem/size/color/fabric/fit)', () => {
    const spec = {
      sizeSystem: 'US',
      size: 'L',
      color: 'champagne',
      fabric: '95% polyester 5% elastane',
      fit: 'regular',
      measurements: 'Bust 82-88cm, Length 92cm',
      tryOnInfo: 'Model 175cm wears S',
    }
    const out = buildCartLineAttrs(spec)
    const keys = out.map((a) => a.key)
    expect(keys).toContain('sizeSystem')
    expect(keys).toContain('size')
    expect(keys).toContain('color')
    expect(keys).toContain('fabric')
    expect(out.find((a) => a.key === 'size')?.value).toBe('L')
    // 长描述字段不进购物车行摘要
    expect(keys).not.toContain('measurements')
    expect(keys).not.toContain('tryOnInfo')
  })

  it('shows wig attributes in canonical order', () => {
    const spec = {
      hairMaterial: 'human-hair',
      texture: 'body-wave',
      laceType: 'HD',
      capSize: '22',
      length: '18',
      color: 'natural-black',
      density: '180%',
      glueless: 'yes',
    }
    const out = buildCartLineAttrs(spec)
    const keys = out.map((a) => a.key)
    // texture 早于 laceType 早于 length 早于 density
    expect(keys.indexOf('texture')).toBeLessThan(keys.indexOf('laceType'))
    expect(keys.indexOf('laceType')).toBeLessThan(keys.indexOf('length'))
    expect(keys.indexOf('length')).toBeLessThan(keys.indexOf('density'))
    expect(out.find((a) => a.key === 'density')?.value).toBe('180%')
  })

  it('filters empty/blank values from spec', () => {
    const spec = { sizeSystem: '', size: '  ', color: 'champagne', fabric: 'satin' }
    const out = buildCartLineAttrs(spec)
    const keys = out.map((a) => a.key)
    expect(keys).not.toContain('sizeSystem')
    expect(keys).not.toContain('size')
    expect(keys).toEqual(['color', 'fabric'])
  })

  it('ignores attributes not in CART_LINE_ATTR_ORDER', () => {
    const out = buildCartLineAttrs({ customField: 'x', color: 'black' })
    expect(out.map((a) => a.key)).toEqual(['color'])
  })

  it('returns empty array for null/undefined/non-object spec', () => {
    expect(buildCartLineAttrs(null as unknown as Record<string, string>)).toEqual([])
    expect(buildCartLineAttrs(undefined as unknown as Record<string, string>)).toEqual([])
    expect(buildCartLineAttrs('x' as unknown as Record<string, string>)).toEqual([])
    expect(buildCartLineAttrs({})).toEqual([])
  })

  it('each returned attr carries key/labelKey/value and trims whitespace', () => {
    const out = buildCartLineAttrs({ color: '  champagne  ', size: 'L' })
    const colorAttr = out.find((a) => a.key === 'color')!
    expect(colorAttr.labelKey).toBe('attr.color')
    expect(colorAttr.value).toBe('champagne')
    expect(CART_LINE_ATTR_ORDER.length).toBeGreaterThan(0)
  })
})
