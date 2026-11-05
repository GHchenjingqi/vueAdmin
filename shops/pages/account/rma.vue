<script setup lang="ts">
import { ref } from 'vue'
import { getToken, submitRma, listMyRmas } from '@shared/customer/auth'

/**
 * 退货申请 / RMA 列表（P4-T05/T06）：登录态；服务端校验订单归属 + 可退状态 + 重算退款。
 */
const orderId = ref('')
const orderItemId = ref('')
const skuId = ref('')
const qty = ref(1)
const reason = ref('')
const busy = ref(false)
const message = ref('')
const error = ref('')
const rmas = ref<unknown[] | null>(null)

if (!getToken()) {
  await navigateTo('/account', { replace: true })
}

async function load(): Promise<void> {
  try {
    rmas.value = await listMyRmas()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败'
  }
}

await load()

async function submit(): Promise<void> {
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    await submitRma(
      Number(orderId.value),
      [{ orderItemId: Number(orderItemId.value), skuId: Number(skuId.value), qty: Number(qty.value) }],
      reason.value || undefined,
    )
    message.value = '退货申请已提交，等待审核'
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '提交失败'
  } finally {
    busy.value = false
  }
}

useSeo({ title: '退货申请', description: 'RMA', path: '/account/rma' })
</script>

<template>
  <div class="mx-auto max-w-xl space-y-6">
    <h1 class="text-2xl font-semibold">退货申请 / RMA</h1>

    <form class="space-y-3 rounded-xl border border-stone-200 p-5" @submit.prevent="submit">
      <h2 class="text-sm font-semibold">新建申请</h2>
      <div class="grid grid-cols-3 gap-2">
        <input v-model="orderId" required placeholder="订单 ID（数字）" class="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        <input v-model="orderItemId" required placeholder="订单明细 ID" class="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        <input v-model="skuId" required placeholder="SKU ID" class="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
      </div>
      <input v-model.number="qty" type="number" min="1" class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" placeholder="数量" />
      <textarea v-model="reason" rows="2" class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" placeholder="退货原因（可选）" />
      <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
      <p v-if="message" class="text-xs text-emerald-700">{{ message }}</p>
      <button type="submit" class="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50" :disabled="busy">
        {{ busy ? '提交中…' : '提交退货申请' }}
      </button>
    </form>

    <section class="rounded-xl border border-stone-200 p-5">
      <h2 class="mb-3 text-sm font-semibold">我的申请</h2>
      <p v-if="(rmas?.length ?? 0) === 0" class="text-sm text-stone-500">暂无退货申请。</p>
      <ul v-else class="space-y-2 text-sm">
        <li v-for="(r, idx) in rmas ?? []" :key="idx" class="rounded-lg border border-stone-100 px-3 py-2">
          {{ JSON.stringify(r).slice(0, 120) }}…
        </li>
      </ul>
    </section>
  </div>
</template>
