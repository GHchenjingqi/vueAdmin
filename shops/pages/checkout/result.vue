<script setup lang="ts">
import { useCheckout } from '~/composables/useCheckout'
import Price from '~/components/commerce/Price.vue'
import { useI18n } from '~/composables/useI18n'
import { trackPurchase } from '@shared/analytics/ecommerce'

/**
 * 支付结果页（P3-T15 前端版）：由服务端订单状态驱动（getOrder 校验 accessToken），不盲信 URL 参数。
 * 处理中状态有轮询与超时提示；支付按钮触发 mock 支付会话。文案接入 i18n（P5-T01）。
 */
const { t } = useI18n()
const route = useRoute()
const { getOrder, pay } = useCheckout()

const orderNo = computed(() => String(route.query.order ?? ''))
const orderId = computed(() => String(route.query.id ?? ''))
const token = computed(() => String(route.query.t ?? ''))

interface OrderResponse {
  orderNo: string
  status: string
  paymentStatus: string
  email: string
  currency: string
  totals: { total: { amount: number; currency: string } }
  items: { skuId: number; title: string; qty: number; unit: { amount: number; currency: string }; lineTotal: { amount: number; currency: string } }[]
}

const { data: order, refresh } = await useAsyncData(
  'order-result',
  async (): Promise<OrderResponse | null> => {
    const key = orderId.value || orderNo.value
    if (!key || !token.value) return null
    try {
      return await getOrder(key, token.value)
    } catch {
      return null
    }
  },
  { server: true },
)

const paid = computed(() => order.value?.paymentStatus === 'captured' || ['paid', 'processing'].includes(order.value?.status ?? ''))
// P4-T04：凭订单号 + 访问凭证双要素进入轨迹页（与后端防枚举契约一致）
const trackingLink = computed(() => (order.value ? `/track?orderNo=${encodeURIComponent(order.value.orderNo)}&t=${encodeURIComponent(token.value)}` : ''))
const polling = ref(false)
const payError = ref<string | null>(null)
const purchaseTracked = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

async function payNow(): Promise<void> {
  payError.value = null
  try {
    const key = orderId.value || orderNo.value
    if (!key) return
    const res = await pay(key, token.value)
    await refresh()
    if (!paid.value && res.sessionUrl) await navigateTo(res.sessionUrl, { external: true })
  } catch (err) {
    payError.value = err instanceof Error ? err.message : t('result.paymentFailed')
  }
}

// P4-T10：purchase 以服务端事实为准（paymentStatus=captured 才发；金额/币种取订单快照）
watchEffect(() => {
  if (order.value && paid.value && !purchaseTracked.value) {
    purchaseTracked.value = true
    trackPurchase({
      orderNo: order.value.orderNo,
      totals: { total: order.value.totals.total },
      items: order.value.items.map((i) => ({
        skuId: i.skuId,
        title: i.title,
        qty: i.qty,
        unit: i.unit ?? { amount: Math.round(i.lineTotal.amount / Math.max(1, i.qty)), currency: i.lineTotal.currency },
      })),
    })
  }
})

onMounted(() => {
  if (order.value && !paid.value) {
    polling.value = true
    let elapsed = 0
    pollTimer = setInterval(async () => {
      elapsed += 3
      await refresh()
      if (paid.value || elapsed > 60) {
        polling.value = false
        if (pollTimer) clearInterval(pollTimer)
      }
    }, 3000)
  }
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

useSeo({ title: () => t('result.title'), description: () => t('result.description'), path: '/checkout/result', noindex: true })
</script>

<template>
  <div class="mx-auto max-w-xl">
    <h1 class="mb-6 text-2xl font-semibold">{{ t('result.title') }}</h1>

    <div v-if="!order" class="rounded-xl border border-stone-200 p-8 text-center">
      <p class="text-sm font-medium text-stone-900">{{ t('result.notFound') }}</p>
      <p class="mt-1 text-sm text-stone-500">{{ t('result.invalid') }}</p>
      <NuxtLink to="/" class="mt-4 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">{{ t('result.backHome') }}</NuxtLink>
    </div>

    <div v-else class="space-y-4 rounded-xl border border-stone-200 p-6">
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold">{{ t('track.orderPrefix') }} {{ order.orderNo }}</span>
        <span class="rounded-full px-2.5 py-0.5 text-xs font-medium" :class="paid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'">
          {{ paid ? t('result.paid') : t('result.pending') }}
        </span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-stone-500">{{ t('result.email') }}</span>
        <span>{{ order.email }}</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-stone-500">{{ t('result.total') }}</span>
        <Price :money="order.totals.total" size="md" />
      </div>
      <ul class="space-y-1 border-t border-stone-200 pt-3 text-sm text-stone-600">
        <li v-for="item in order.items" :key="item.skuId" class="flex justify-between">
          <span>{{ item.title }} × {{ item.qty }}</span>
          <Price :money="item.lineTotal" size="sm" />
        </li>
      </ul>
      <p v-if="payError" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{{ payError }}</p>
      <button v-if="!paid" type="button" class="w-full rounded-lg bg-stone-900 px-6 py-3 text-sm font-semibold text-white hover:bg-stone-700" @click="payNow">
        {{ t('result.payNow') }}
      </button>
      <p v-if="polling && !paid" class="text-xs text-stone-500">{{ t('result.polling') }}</p>
      <NuxtLink
        v-if="paid && trackingLink"
        :to="trackingLink"
        class="block rounded-lg border border-stone-300 px-6 py-2.5 text-center text-sm font-semibold hover:border-stone-900"
      >
        {{ t('result.track') }}
      </NuxtLink>
    </div>
  </div>
</template>
