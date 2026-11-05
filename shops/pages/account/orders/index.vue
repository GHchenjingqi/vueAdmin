<script setup lang="ts">
import { ref } from 'vue'
import { getToken } from '@shared/customer/auth'
import { useCheckout } from '~/composables/useCheckout'
import Price from '~/components/commerce/Price.vue'

/**
 * 顾客订单列表（P4-T03）：仅展示本人订单；金额按订单快照币种展示；分页与空态完整。
 * 数据源：/api/checkout/orders（BFF 直通真实后台，Bearer 顾客 JWT）。
 * 详情复用 P3-T16 双要素路径 /checkout/result?id=<id>&t=<accessToken>（列表仅返回本人凭证）。
 */
interface OrderRow {
  id: number
  orderNo: string
  accessToken: string
  status: string
  paymentStatus: string
  currency: string
  createdAt: string
  totals: { total: { amount: number; currency: string } }
}

if (!getToken()) await navigateTo('/account', { replace: true })

const { listOrders } = useCheckout()
const orders = ref<OrderRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const loading = ref(true)
const error = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await listOrders(page.value, pageSize)
    orders.value = res.items as unknown as OrderRow[]
    total.value = res.total
  } catch (err) {
    error.value = err instanceof Error ? err.message : '订单加载失败'
  } finally {
    loading.value = false
  }
}
await load()

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
function goPage(p: number): void {
  if (p < 1 || p > pageCount.value || p === page.value) return
  page.value = p
  load()
}

const statusText: Record<string, string> = {
  created: '已创建', processing: '处理中', paid: '已支付', fulfilled: '已履约',
  shipped: '已发货', done: '已完成', cancelled: '已取消',
}
const paymentText: Record<string, string> = {
  none: '未支付', pending: '待支付', authorized: '已授权', captured: '已扣款',
  refunding: '退款中', refunded: '已退款', failed: '支付失败',
}
function fmtDate(v: string): string {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

useSeo({ title: 'My Orders', description: 'View your order history', path: '/account/orders' })
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <h1 class="mb-4 text-xl font-semibold">我的订单</h1>

    <div v-if="error" class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{{ error }}</div>

    <div v-if="loading" class="py-12 text-center text-sm text-stone-400">加载中…</div>

    <div v-else-if="orders.length === 0" class="rounded-xl border border-dashed border-stone-300 py-16 text-center">
      <p class="text-stone-500">暂无订单</p>
      <NuxtLink to="/collections" class="mt-3 inline-block text-sm font-medium text-stone-900 underline">去逛逛</NuxtLink>
    </div>

    <ul v-else class="space-y-3">
      <li v-for="o in orders" :key="o.id" class="rounded-xl border border-stone-200 p-4">
        <NuxtLink :to="`/checkout/result?id=${o.id}&t=${encodeURIComponent(o.accessToken)}`" class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="font-medium">#{{ o.orderNo }}</p>
            <p class="mt-0.5 text-xs text-stone-500">{{ fmtDate(o.createdAt) }}</p>
          </div>
          <div class="text-right">
            <p class="font-semibold"><Price :money="{ amount: o.totals.total.amount, currency: o.currency }" /></p>
            <p class="mt-0.5 text-xs">
              <span class="text-stone-500">{{ statusText[o.status] ?? o.status }}</span>
              <span class="mx-1 text-stone-300">·</span>
              <span class="text-stone-500">{{ paymentText[o.paymentStatus] ?? o.paymentStatus }}</span>
            </p>
          </div>
        </NuxtLink>
      </li>
    </ul>

    <nav v-if="pageCount > 1" class="mt-6 flex items-center justify-center gap-4 text-sm">
      <button class="disabled:opacity-40" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
      <span class="text-stone-500">{{ page }} / {{ pageCount }}</span>
      <button class="disabled:opacity-40" :disabled="page >= pageCount" @click="goPage(page + 1)">下一页</button>
    </nav>
  </div>
</template>
