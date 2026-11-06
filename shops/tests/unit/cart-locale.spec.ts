import { describe, expect, it } from 'vitest'
import { MockStore } from '../../shared/mock/store'

/**
 * P5-T01：语言与币种互不推导 + 切换语言不丢购物车。
 * 购物车按 token（guest）服务端存储，locale 仅作独立快照，切换语言不清空。
 */
describe('P5-T01 购物车语言快照', () => {
  // 有效变体：product 101 首个变体 id = 10100（见 shared/mock/fixtures）
  const SKU = 10100

  it('addItem 记录 locale 且与 currency 解耦（zh-CN 加购仍为 USD）', () => {
    const store = new MockStore()
    const cart = store.addItem('token-a', 'USD', SKU, 1, 'zh-CN')
    expect(cart.currency).toBe('USD')
    expect(cart.locale).toBe('zh-CN')
    expect(cart.itemCount).toBe(1)
  })

  it('切换语言只更新 locale，不丢购物车内容', () => {
    const store = new MockStore()
    store.addItem('token-a', 'USD', SKU, 2, 'zh-CN')
    // 用户切到 en-US 后再次访问购物车（GET，带新 locale）
    const after = store.getOrCreateCart('token-a', 'USD', 'en-US')
    const view = store.presentCart(after)
    expect(view.locale).toBe('en-US')
    expect(view.itemCount).toBe(2) // 购物车内容未丢失
    expect(view.currency).toBe('USD') // 币种不受语言影响
  })

  it('无 locale 时购物车视图 locale 为空（兼容旧数据）', () => {
    const store = new MockStore()
    const cart = store.addItem('token-b', 'USD', SKU, 1)
    expect(cart.locale).toBeUndefined()
  })
})
