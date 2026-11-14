<script setup lang="ts">
import { useCheckout } from '~/composables/useCheckout'
import Price from '~/components/commerce/Price.vue'
import { useI18n } from '~/composables/useI18n'
import { trackBeginCheckout } from '@shared/analytics/ecommerce'
import { collectAttribution } from '@shared/analytics/attribution'

/**
 * 结算页（P3-T09 前端版）：地址表单（字段级校验）、报价确认、运费选择、优惠券。
 * 报价为服务端重算（BFF mock：前端传入总价被忽略）；金额对象 {amount, currency}。文案接入 i18n（P5-T01）。
 */
const { t, ti } = useI18n()
const { placeOrder, loading } = useCheckout()

// P5-T08：checkout_cta 业务实验（仅按钮文案变体；关闭/未知 fail-closed → control）
const { assign } = useExperiment()
const ctaLabel = ref(t('checkout.placeOrder'))
onMounted(async () => {
  const a = await assign('checkout_cta')
  if (a.enabled && a.variant === 'variant_a') ctaLabel.value = t('checkout.secureCta')
})

const address = reactive({
  fullName: '',
  phone: '',
  country: 'US',
  province: '',
  city: '',
  address1: '',
  postcode: '',
})
const couponCode = ref('')
// 档位由服务端下发（见 quote.shippingRates）；初始为空，拿到首个报价后落到服务端返回的默认档
const shippingRateId = ref('')
const email = ref('')
const submitting = ref(false)
const submitError = ref<string | null>(null)
const fieldErrors = reactive<Record<string, string>>({})

/**
 * 可配送国家：优先用报价响应里的 shippableCountries（与后台 settings.shop.shipping 同源），
 * 取不到时回退内置列表。国家是运费分区与税率的唯一依据，不能让用户自由输入。
 */
const FALLBACK_COUNTRIES = ['US', 'CA', 'GB', 'DE', 'FR', 'AU', 'JP', 'SG']
const shippingCountries = computed(() => {
  const fromServer = quote.value?.shippableCountries ?? []
  return fromServer.length > 0 ? fromServer : FALLBACK_COUNTRIES
})

interface QuoteResponse {
  quoteId: string
  version: number
  expiresAt: string
  currency: string
  items: { skuId: number; title: string; qty: number; unit: { amount: number; currency: string }; lineTotal: { amount: number; currency: string } }[]
  totals: {
    subtotal: { amount: number; currency: string }
    discount: { amount: number; currency: string }
    shipping: { amount: number; currency: string }
    tax: { amount: number; currency: string }
    total: { amount: number; currency: string }
  }
  shippingRates: { id: string; name: string; amount: { amount: number; currency: string }; etaDays: string }[]
  appliedCoupon: { code: string; discount: { amount: number; currency: string } } | null
  deliveryCommitment?: { warehouseId: number; warehouseName: string; warehouseType: string; deliveryEstimateDays: number } | null
  shippableCountries?: string[]
}

const { data: quote, refresh: refreshQuoteBase } = await useAsyncData(
  'checkout-quote',
  () =>
    $fetch<QuoteResponse>('/api/checkout/quote', {
      method: 'POST',
      // 地址是运费与税费的前提：不传地址时服务端只能给出不含税总价（这曾导致税恒为 0）
      body: {
        shippingAddress: address,
        shippingRateId: shippingRateId.value || undefined,
        couponCode: couponCode.value || undefined,
      },
    }),
  { server: true },
)

// 服务端下发档位后，首次进入时选中它返回的默认档，避免前端写死 'std'
watch([quote, shippingRateId], () => {
  const rates = quote.value?.shippingRates ?? []
  if (!shippingRateId.value && rates.length > 0) {
    shippingRateId.value = rates[0].id
  }
})

async function refreshQuote(): Promise<void> {
  await refreshQuoteBase()
  if (quote.value) {
    trackBeginCheckout(
      quote.value.items.map((i) => ({ skuId: i.skuId, title: i.title, qty: i.qty, unit: i.unit })),
      quote.value.totals.total,
    )
  }
}

function validateAddress(): boolean {
  fieldErrors.fullName = address.fullName.trim() ? '' : t('checkout.err.fullName')
  fieldErrors.province = address.province.trim() ? '' : t('checkout.err.province')
  fieldErrors.city = address.city.trim() ? '' : t('checkout.err.city')
  fieldErrors.address1 = address.address1.trim() ? '' : t('checkout.err.address1')
  fieldErrors.postcode = address.postcode.trim() ? '' : t('checkout.err.postcode')
  fieldErrors.email = email.value.includes('@') ? '' : t('checkout.err.email')
  return Object.values(fieldErrors).every((v) => !v)
}

/**
 * 国家变化即重算报价：运费按分区、税费按目的国，两者都依赖 country。
 * 只在国家有效时才重算，避免用户清空字段时把报价打成 400。
 */
watch(
  () => address.country,
  async (country) => {
    if (!country || country.trim().length !== 2) return
    await refreshQuote()
  },
)

async function submit(): Promise<void> {
  submitError.value = null
  if (!validateAddress()) return
  submitting.value = true
  try {
    const order = await placeOrder({
      email: email.value,
      address: { ...address },
      shippingRateId: shippingRateId.value,
      couponCode: couponCode.value || undefined,
      idempotencyKey: crypto.randomUUID(),
      attribution: collectAttribution(),
    })
    await navigateTo(`/checkout/result?id=${order.id}&order=${order.orderNo}&t=${order.accessToken}`)
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : t('checkout.failed')
  } finally {
    submitting.value = false
  }
}

useSeo({ title: () => t('checkout.title'), description: () => t('checkout.description'), path: '/checkout', noindex: true })
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-semibold">{{ t('checkout.title') }}</h1>
    <div class="grid gap-8 lg:grid-cols-2">
      <section>
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">{{ t('checkout.shippingAddress') }}</h2>
        <div class="space-y-3">
          <div v-for="key in Object.keys(address) as (keyof typeof address)[]" :key="key" class="space-y-1">
            <label class="block text-xs font-medium text-stone-600" :for="key">{{ t('field.' + key) }}</label>
            <!-- 国家决定运费分区与税率，用下拉限定为可配送国家，避免自由输入导致 400 -->
            <select
              v-if="key === 'country'"
              :id="key"
              v-model="address[key]"
              class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none"
            >
              <option v-for="c in shippingCountries" :key="c" :value="c">{{ c }}</option>
            </select>
            <input
              v-else
              :id="key"
              v-model="address[key]"
              class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none"
              :aria-invalid="!!fieldErrors[key]"
              @blur="validateAddress"
            />
            <p v-if="fieldErrors[key]" class="text-xs text-red-600">{{ fieldErrors[key] }}</p>
          </div>
          <div class="space-y-1">
            <label class="block text-xs font-medium text-stone-600" for="email">{{ t('checkout.email') }}</label>
            <input
              id="email"
              v-model="email"
              type="email"
              class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none"
              @blur="validateAddress"
            />
            <p v-if="fieldErrors.email" class="text-xs text-red-600">{{ fieldErrors.email }}</p>
          </div>
        </div>

        <h2 class="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-stone-500">{{ t('checkout.shippingMethod') }}</h2>
        <div v-for="rate in quote?.shippingRates ?? []" :key="rate.id" class="mb-2 flex items-center gap-3">
          <input :id="'rate-' + rate.id" v-model="shippingRateId" type="radio" :value="rate.id" name="shippingRate" @change="refreshQuote" />
          <label :for="'rate-' + rate.id" class="text-sm">
            {{ rate.name }} ({{ rate.etaDays }} days) —
            <Price :money="rate.amount" size="sm" />
          </label>
        </div>

        <h2 class="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-stone-500">{{ t('checkout.coupon') }}</h2>
        <div class="flex gap-2">
          <input
            v-model="couponCode"
            class="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
            :placeholder="t('checkout.couponHint')"
          />
          <button type="button" class="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:border-stone-500" @click="refreshQuote">{{ t('checkout.apply') }}</button>
        </div>
      </section>

      <section class="rounded-xl border border-stone-200 p-6">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">{{ t('checkout.orderSummary') }}</h2>
        <div v-if="quote" class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-stone-500">{{ t('checkout.subtotal') }}</span>
            <Price :money="quote.totals.subtotal" size="sm" />
          </div>
          <div class="flex justify-between">
            <span class="text-stone-500">{{ t('checkout.discount') }}</span>
            <Price :money="quote.totals.discount" size="sm" />
          </div>
          <div class="flex justify-between">
            <span class="text-stone-500">{{ t('checkout.shipping') }}</span>
            <Price :money="quote.totals.shipping" size="sm" />
          </div>
          <div v-if="quote.deliveryCommitment" class="flex justify-between">
            <span class="text-stone-500">{{ t('checkout.estimatedDelivery') }}</span>
            <span class="text-stone-700">{{ ti('checkout.businessDays', { n: String(quote.deliveryCommitment.deliveryEstimateDays) }) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-stone-500">{{ t('checkout.tax') }}</span>
            <Price :money="quote.totals.tax" size="sm" />
          </div>
          <div class="flex justify-between border-t border-stone-200 pt-2 text-base font-semibold">
            <span>{{ t('checkout.total') }}</span>
            <Price :money="quote.totals.total" size="md" />
          </div>
        </div>
        <p v-else class="text-sm text-stone-500">{{ t('checkout.addItems') }}</p>

        <p v-if="submitError" class="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{{ submitError }}</p>

        <button
          type="button"
          class="mt-6 w-full rounded-lg bg-stone-900 px-6 py-3 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
          :disabled="loading || submitting"
          @click="submit"
        >
          {{ submitting ? t('checkout.placing') : ctaLabel }}
        </button>
        <p v-if="quote" class="mt-3 text-xs text-stone-400">{{ ti('checkout.quoteExpires', { time: new Date(quote.expiresAt).toLocaleTimeString() }) }}</p>
      </section>
    </div>
  </div>
</template>
