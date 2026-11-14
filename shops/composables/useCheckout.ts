import type { OrderDetail, OrderDraft } from '@shared/types/commerce'
import type { OrderAttribution } from '@shared/analytics/attribution'

/**
 * Checkout 组合式（P3-T09/T15 前端版）：useCheckout()。
 * 数据源：/api/checkout/* 与 /api/orders/*（BFF mock；后端阶段完成后切换真实路由，契约不变）。
 */
export interface PaymentChannel {
  id: string
  label: string
  kind: string
  supportedCurrencies: string[]
}

export interface PaymentSessionView {
  sessionUrl: string
  provider: string
  orderNo?: string
  action?: 'redirect' | 'qr' | 'form' | 'sdk' | 'mock'
  redirectUrl?: string
  qrCode?: string
  form?: { url: string; method: 'GET' | 'POST'; fields: Record<string, string> }
}

/** 按后台勾选 + 当前币种列出可用支付通道（银联 supportedCurrencies=['*'] 全币种可见） */
async function listProviders(currency?: string): Promise<PaymentChannel[]> {
  const qs = currency ? `?currency=${encodeURIComponent(currency)}` : ''
  const res = await fetch(`/api/payments/providers${qs}`)
  const data = (await res.json()) as { code?: number; data?: PaymentChannel[]; message?: string }
  if (!res.ok || (data.code !== undefined && data.code !== 0)) throw new Error(data.message || 'failed to load payment providers')
  return Array.isArray(data) ? (data as unknown as PaymentChannel[]) : (data.data ?? [])
}

export function useCheckout() {
  const order = ref<OrderDraft | null>(null)
  const loading = ref(false)

  async function placeOrder(payload: {
    email: string
    address: Record<string, string>
    shippingRateId?: string
    couponCode?: string
    idempotencyKey?: string
    attribution?: OrderAttribution
  }): Promise<OrderDraft> {
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

  async function pay(orderIdOrNo: string, accessToken?: string, provider?: string): Promise<PaymentSessionView> {
    // 原生 fetch：绕开 Nuxt 类型化路由联合在深层动态路径上的指数比较（TS2321）
    const qs = accessToken ? `?t=${encodeURIComponent(accessToken)}` : ''
    const res = await fetch(`/api/checkout/orders/${orderIdOrNo}/pay${qs}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // P5-T03：可选 provider（如 bnpl）；BFF 透传给后端做 flag+币种前置校验
      body: JSON.stringify(provider ? { provider } : {}),
    })
    const data = (await res.json()) as PaymentSessionView
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

  /**
   * 网关跳转回结果页时只带 orderNo+provider（无 accessToken）。
   * 用回跳凭证换取订单只读状态；凭证无效返回 null（前端按未找到处理）。
   */
  async function getOrderByReturnToken(token: string): Promise<OrderDetail | null> {
    const res = await fetch(`/api/payments/order-by-return-token/${encodeURIComponent(token)}`)
    const data = (await res.json()) as { code?: number; data?: OrderDetail | null; message?: string }
    if (!res.ok) throw new Error(data.message || 'order status lookup failed')
    return data.data ?? null
  }

  /**
   * 网关要求用户在回跳后由服务端主动确认（如 PayPal capture）。
   * 必须由回跳凭证授权，成功幂等落到订单状态机。
   */
  async function capturePayment(orderNo: string, provider: string, returnToken: string): Promise<void> {
    const res = await fetch('/api/payments/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderNo, provider, returnToken }),
    })
    const data = (await res.json()) as { code?: number; message?: string }
    if (!res.ok || (data.code !== undefined && data.code !== 0)) throw new Error(data.message || 'capture failed')
  }

  /** P4-T03：当前顾客订单列表（Bearer 顾客 JWT，金额按订单快照币种展示） */
  async function listOrders(page = 1, pageSize = 10): Promise<{ items: OrderDraft[]; total: number; page: number; pageSize: number }> {
    const { getToken } = await import('@shared/customer/auth')
    const token = getToken()
    const res = await fetch(`/api/checkout/orders?page=${page}&pageSize=${pageSize}`, {
      // PLAN 5.2：Cookie 模式下 token 为 null，必须带 credentials 才能携带 httpOnly 会话
      credentials: 'same-origin',
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
    const data = (await res.json()) as { items?: OrderDraft[]; total?: number; page?: number; pageSize?: number } & { message?: string }
    if (!res.ok) throw new Error(data.message || 'failed to load orders')
    return { items: data.items ?? [], total: data.total ?? 0, page: data.page ?? page, pageSize: data.pageSize ?? pageSize }
  }

  return { order, loading, placeOrder, pay, getOrder, getOrderByReturnToken, capturePayment, listOrders, listProviders }
}
