<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getToken, getStoredCustomer, type CustomerPublic } from '@shared/customer/auth'
import { useI18n } from '~/composables/useI18n'

/**
 * 我的优惠券页（#13）：顾客可领用券列表。
 * 端点 /api/coupons/available（BFF 直通 /api/storefront/v1/coupons/available，Bearer 顾客 JWT）。
 * auto/real 走真实后台；mock 模式由 BFF 返回固定示例券，页面无需区分。
 */
interface AvailableCoupon {
  id: number
  code: string
  type: 'fixed' | 'percent'
  value: number
  minSpend: number
  currency: string
  validFrom: string
  validTo: string
  usageLimit: number
  usedCount: number
  /** -1 表示不限量 */
  remaining: number
}

const { t, ti } = useI18n()
const customer = ref<CustomerPublic | null>(getStoredCustomer())
const loggedIn = computed(() => !!customer.value && !!getToken())
const coupons = ref<AvailableCoupon[]>([])
const loading = ref(false)
const error = ref('')
const copiedId = ref<number | null>(null)

onMounted(async () => {
  if (!loggedIn.value) return
  await reload()
})

async function reload(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const raw = await $fetch<AvailableCoupon[] | { data?: AvailableCoupon[] }>('/api/coupons/available', {
      headers: { authorization: `Bearer ${getToken() ?? ''}` },
    })
    // BFF 正常已解包为数组；兼容后端信封直出
    const list = Array.isArray(raw) ? raw : (raw?.data ?? [])
    coupons.value = Array.isArray(list) ? list : []
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('coupons.loadFailed')
  } finally {
    loading.value = false
  }
}

function discountText(c: AvailableCoupon): string {
  return c.type === 'percent'
    ? ti('coupons.percentOff', { value: String(c.value) })
    : ti('coupons.fixedOff', { currency: c.currency, value: Number(c.value).toFixed(2) })
}

function minSpendText(c: AvailableCoupon): string {
  return Number(c.minSpend) > 0
    ? ti('coupons.minSpend', { amount: `${c.currency} ${Number(c.minSpend).toFixed(2)}` })
    : t('coupons.noMinSpend')
}

function remainingText(c: AvailableCoupon): string {
  return c.remaining < 0 ? t('coupons.unlimited') : ti('coupons.remaining', { n: String(c.remaining) })
}

async function copyCode(c: AvailableCoupon): Promise<void> {
  try {
    await navigator.clipboard.writeText(c.code)
  } catch {
    // 非安全上下文降级：临时 textarea + execCommand
    const el = document.createElement('textarea')
    el.value = c.code
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    try { document.execCommand('copy') } finally { document.body.removeChild(el) }
  }
  copiedId.value = c.id
  window.setTimeout(() => { if (copiedId.value === c.id) copiedId.value = null }, 2000)
}

useSeo({ title: () => t('coupons.title'), description: () => t('coupons.description'), path: '/account/coupons', noindex: true })
</script>

<template>
  <div>
    <h1 class="mb-2 text-2xl font-semibold">{{ t('coupons.title') }}</h1>
    <p class="mb-6 text-sm text-stone-500">{{ t('coupons.description') }}</p>

    <div v-if="!loggedIn" class="mb-6 rounded-lg bg-stone-50 px-4 py-3 text-xs text-stone-600">
      {{ t('coupons.needLogin') }}
      <NuxtLink to="/account" class="ml-1 font-medium underline">{{ t('account.registerLogin') }}</NuxtLink>
    </div>

    <p v-if="error" class="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>

    <div v-if="loggedIn && loading" class="grid gap-4 sm:grid-cols-2">
      <div v-for="n in 4" :key="n" class="h-40 animate-pulse rounded-xl bg-stone-100" />
    </div>

    <div v-else-if="loggedIn && !coupons.length" class="rounded-xl border border-stone-200 p-12 text-center">
      <p class="text-sm text-stone-600">{{ t('coupons.empty') }}</p>
      <NuxtLink to="/" class="mt-4 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">
        {{ t('coupons.backHome') }}
      </NuxtLink>
    </div>

    <ul v-else-if="loggedIn" class="grid gap-4 sm:grid-cols-2">
      <li v-for="c in coupons" :key="c.id" class="relative overflow-hidden rounded-xl border border-stone-200 bg-white p-5">
        <div class="absolute inset-y-0 left-0 w-1.5 bg-stone-900" />
        <div class="flex items-start justify-between gap-3 pl-2">
          <div>
            <p class="text-xl font-semibold text-stone-900">{{ discountText(c) }}</p>
            <p class="mt-1 text-xs text-stone-500">{{ minSpendText(c) }}</p>
          </div>
          <span class="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600">{{ remainingText(c) }}</span>
        </div>
        <div class="mt-4 flex items-center justify-between gap-2 border-t border-dashed border-stone-200 pt-3 pl-2">
          <code class="rounded bg-stone-50 px-2 py-1 text-sm font-semibold tracking-wide text-stone-800">{{ c.code }}</code>
          <button
            type="button"
            class="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-stone-500"
            @click="copyCode(c)"
          >
            {{ copiedId === c.id ? t('coupons.copied') : t('coupons.copy') }}
          </button>
        </div>
        <p class="mt-3 pl-2 text-xs text-stone-500">
          {{ ti('coupons.validUntil', { date: c.validTo }) }} · {{ t('coupons.hint') }}
        </p>
      </li>
    </ul>
  </div>
</template>
