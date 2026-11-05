import type { Cart, CartItem } from '@shared/types/commerce'

/**
 * Cart 组合式（P3-T02 前端版）：useCart()。
 * 数据源：/api/cart/*（BFF mock；后端阶段完成后切换真实路由，契约不变）。
 */
export function useCart() {
  const cart = ref<Cart | null>(null)
  const loading = ref(false)

  async function load(): Promise<Cart | null> {
    loading.value = true
    try {
      cart.value = await $fetch<Cart>('/api/cart')
    } catch {
      cart.value = null
    } finally {
      loading.value = false
    }
    return cart.value
  }

  async function add(skuId: number, qty = 1): Promise<Cart | null> {
    cart.value = await $fetch<Cart>('/api/cart/items', { method: 'POST', body: { skuId, qty } })
    return cart.value
  }

  async function update(itemId: number, qty: number): Promise<void> {
    cart.value = await $fetch<Cart>('/api/cart/items/' + itemId, { method: 'PATCH', body: { qty } })
  }

  async function remove(itemId: number): Promise<void> {
    cart.value = await $fetch<Cart>('/api/cart/items/' + itemId, { method: 'DELETE' })
  }

  const itemCount = computed(() => cart.value?.itemCount ?? 0)
  const items = computed<CartItem[]>(() => cart.value?.items ?? [])

  return { cart, loading, load, add, update, remove, itemCount, items }
}
