<script setup lang="ts">
import { ref } from 'vue'
import { getToken, submitRma, listMyRmas } from '@shared/customer/auth'
import { useI18n } from '~/composables/useI18n'

/**
 * 退货申请 / RMA 列表（P4-T05/T06）：登录态；服务端校验订单归属 + 可退状态 + 重算退款。
 * 文案接入 i18n（P5-T01）。
 */
const { t } = useI18n()
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
    error.value = err instanceof Error ? err.message : t('rma.loadFailed')
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
    message.value = t('rma.submitted')
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('rma.submitFailed')
  } finally {
    busy.value = false
  }
}

useSeo({ title: () => t('rma.title'), description: () => t('rma.description'), path: '/account/rma', noindex: true })
</script>

<template>
  <div class="mx-auto max-w-xl space-y-6">
    <h1 class="text-2xl font-semibold">{{ t('rma.title') }}</h1>

    <form class="space-y-3 rounded-xl border border-stone-200 p-5" @submit.prevent="submit">
      <h2 class="text-sm font-semibold">{{ t('rma.new') }}</h2>
      <div class="grid grid-cols-3 gap-2">
        <input v-model="orderId" required :placeholder="t('rma.orderId')" class="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        <input v-model="orderItemId" required :placeholder="t('rma.itemId')" class="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        <input v-model="skuId" required :placeholder="t('rma.sku')" class="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
      </div>
      <input v-model.number="qty" type="number" min="1" class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" :placeholder="t('rma.qty')" />
      <textarea v-model="reason" rows="2" class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" :placeholder="t('rma.reason')" />
      <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
      <p v-if="message" class="text-xs text-emerald-700">{{ message }}</p>
      <button
        type="submit"
        class="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
        :disabled="busy"
      >
        {{ busy ? t('rma.submitting') : t('rma.submit') }}
      </button>
    </form>

    <section class="rounded-xl border border-stone-200 p-5">
      <h2 class="mb-3 text-sm font-semibold">{{ t('rma.my') }}</h2>
      <p v-if="(rmas?.length ?? 0) === 0" class="text-sm text-stone-500">{{ t('rma.empty') }}</p>
      <ul v-else class="space-y-2 text-sm">
        <li v-for="(r, idx) in rmas ?? []" :key="idx" class="rounded-lg border border-stone-100 px-3 py-2">{{ JSON.stringify(r).slice(0, 120) }}…</li>
      </ul>
    </section>
  </div>
</template>
