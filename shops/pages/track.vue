<script setup lang="ts">
/**
 * 物流轨迹查询页（P4-T04 前端接线）。
 *
 * - 凭「订单号 + 访问凭证」双要素查询，凭证错误/缺失一律显示 order not found（防枚举）；
 * - 结果页 `/checkout/result` 的 Track shipment 链接会带入 orderNo + t，本页自动查询；
 * - 页面 noindex + private no-store（含凭证的 URL 不进索引、不进 CDN 缓存）。
 */
interface TrackingNode {
  time: string
  description: string
  location?: string
  status?: string
}

interface TrackingView {
  orderNo: string
  status: string
  carrier: string | null
  trackingNo: string | null
  events: TrackingNode[]
  provider: string
  syncedAt: string
}

const route = useRoute()
const orderNo = ref(String(route.query.orderNo ?? ''))
const token = ref(String(route.query.t ?? ''))
const loading = ref(false)
const error = ref<string | null>(null)
const tracking = ref<TrackingView | null>(null)

async function lookup(): Promise<void> {
  error.value = null
  tracking.value = null
  const no = orderNo.value.trim()
  const t = token.value.trim()
  if (!no || !t) {
    error.value = 'Order number and access code are both required.'
    return
  }
  loading.value = true
  try {
    tracking.value = await $fetch<TrackingView>(`/api/track/${encodeURIComponent(no)}`, {
      query: { t },
    })
  } catch {
    error.value = 'Order not found or invalid access link.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (orderNo.value && token.value) void lookup()
})

useSeo({ title: 'Track Your Order', description: 'Check your shipment status', path: '/track' })
useHead({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
</script>

<template>
  <div class="mx-auto max-w-xl">
    <h1 class="mb-2 text-2xl font-semibold">Track Your Order</h1>
    <p class="mb-6 text-sm text-stone-500">Enter the order number and the access code from your confirmation email or order result page.</p>

    <form class="space-y-3 rounded-xl border border-stone-200 p-6" @submit.prevent="lookup">
      <div class="space-y-1">
        <label class="block text-xs font-medium text-stone-600" for="track-order-no">Order number</label>
        <input
          id="track-order-no"
          v-model="orderNo"
          class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none"
          autocomplete="off"
        />
      </div>
      <div class="space-y-1">
        <label class="block text-xs font-medium text-stone-600" for="track-token">Access code</label>
        <input
          id="track-token"
          v-model="token"
          type="password"
          class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none"
          autocomplete="off"
        />
      </div>
      <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{{ error }}</p>
      <button type="submit" class="w-full rounded-lg bg-stone-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50" :disabled="loading">
        {{ loading ? 'Looking up…' : 'Track order' }}
      </button>
    </form>

    <section v-if="tracking" class="mt-6 space-y-4 rounded-xl border border-stone-200 p-6">
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold">Order {{ tracking.orderNo }}</span>
        <span class="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700">{{ tracking.status }}</span>
      </div>
      <div v-if="tracking.trackingNo" class="flex justify-between text-sm">
        <span class="text-stone-500">{{ tracking.carrier || 'Carrier' }}</span>
        <span class="font-mono text-xs">{{ tracking.trackingNo }}</span>
      </div>
      <p v-else class="text-sm text-stone-500">Your shipment has not been dispatched yet. Please check back later.</p>

      <ol v-if="tracking.events.length" class="space-y-3 border-t border-stone-200 pt-4">
        <li v-for="(node, idx) in tracking.events" :key="`${node.time}-${idx}`" class="flex gap-3 text-sm">
          <span class="w-36 shrink-0 text-xs text-stone-500">{{ node.time }}</span>
          <span>
            <span class="text-stone-900">{{ node.description }}</span>
            <span v-if="node.location" class="block text-xs text-stone-500">{{ node.location }}</span>
          </span>
        </li>
      </ol>
      <p v-else-if="tracking.trackingNo" class="border-t border-stone-200 pt-4 text-xs text-stone-500">No tracking events have been reported yet.</p>
    </section>
  </div>
</template>
