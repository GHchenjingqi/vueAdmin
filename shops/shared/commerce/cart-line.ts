/**
 * 购物车/订单行属性摘要（修复"加购信息不全"）：
 * - 旧行只硬编码 wig 的 3 字段（texture/length/color），apparel 的 sizeSystem/size/fabric 丢失。
 * - 统一按品类惯用顺序遍历关键变体属性，过滤 spec 中无值项；key 用 attr.* i18n 文案。
 * - 纯函数便于单测锁定顺序与过滤行为。
 * 注：不显示 fit/measurements/tryOnInfo/hairMaterial 等长描述性字段（行摘要保持精简；详情页看全量）。
 */
export const CART_LINE_ATTR_ORDER: ReadonlyArray<readonly [string, string]> = [
  ['sizeSystem', 'attr.sizeSystem'],
  ['size', 'attr.size'],
  ['color', 'attr.color'],
  ['fabric', 'attr.fabric'],
  ['hairMaterial', 'attr.hairMaterial'],
  ['texture', 'attr.texture'],
  ['laceType', 'attr.laceType'],
  ['length', 'attr.length'],
  ['density', 'attr.density'],
  ['capSize', 'attr.capSize'],
  ['glueless', 'attr.glueless'],
  ['fit', 'attr.fit'],
]

export interface CartLineAttr {
  key: string
  labelKey: string
  value: string
}

/**
 * 返回购物车行应显示的属性对（按 CART_LINE_ATTR_ORDER 顺序，过滤 spec 中无值/空串项）。
 * spec 为完整变体属性 Record；未在 ORDER 中的属性忽略。
 */
export function buildCartLineAttrs(spec: Record<string, string>): CartLineAttr[] {
  if (!spec || typeof spec !== 'object') return []
  return CART_LINE_ATTR_ORDER.filter(([key]) => {
    const v = spec[key]
    return typeof v === 'string' && v.trim() !== ''
  }).map(([key, labelKey]) => ({ key, labelKey, value: spec[key].trim() }))
}
