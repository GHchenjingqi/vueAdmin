import type { OrderDetail, OrderDraft } from '@shared/types/commerce'

/**
 * Checkout 组合式（P3-T09/T15 前端版）：useCheckout()。
 * 数据源：/api/checkout/* 与 /api/orders/*（BFF mock；后端阶段完成后切换真实路由，契约不变）。
 */
export function useCheckout() {
  const order = ref<OrderDraft | null>(null)
  const loading = ref(false)

  async function placeOrder(payload: { email: string; address: Record<string, string>; shippingRateId?: string; couponCode?: string; idempotencyKey?: string }): Promise<OrderDraft> {
    loading.value = true
    try {
      order.value = await $fetch<OrderDraft>('/api/checkout/orders', {
        method: 'POST',
        body: payload,
        headers: payload.idempotencyKey ? { 'Idempotency-Key': payload.idempotencyKey } : {},
      })
      return order.value as OrderDraft
    } finally {
      loading.value = false
    }
  }

  async function pay(orderIdOrNo: string, accessToken?: string): Promise<{ sessionUrl: string; provider: string }> {
    // 原生 fetch：绕开 Nuxt 类型化路由联合在深层动态路径上的指数比较（TS2321）
    const qs = accessToken ? `?t=${encodeURIComponent(accessToken)}` : ''
    const res = await fetch(`/api/checkout/orders/${orderIdOrNo}/pay${qs}`, { method: 'POST' })
    const data = (await res.json()) as { sessionUrl: string; provider: string }
    if (!res.ok) throw new Error((data as unknown as { message?: string })?.message || 'payment failed')
    return data
  }

  async function getOrder(orderIdOrNo: string, token: string): Promise<OrderDetail> {
    // 原生 fetch：同 pay，绕开 typedRoutes 类型联合爆栈
    const res = await fetch(`/api/orders/${orderIdOrNo}?t=${encodeURIComponent(token)}`)
    const data = (await res.json()) as OrderDetail
    if (!res.ok) throw new Error((data as unknown as { message?: string })?.message || 'order not found')
    return data
  }

  return { order, loading, placeOrder, pay, getOrder }
}
