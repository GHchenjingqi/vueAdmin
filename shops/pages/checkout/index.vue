<script setup lang="ts">
import { useCheckout } from '~/composables/useCheckout'
import Price from '~/components/commerce/Price.vue'
import { trackBeginCheckout } from '@shared/analytics/ecommerce'
import { collectAttribution } from '@shared/analytics/attribution'

/**
 * 结算页（P3-T09 前端版）：地址表单（字段级校验）、报价确认、运费选择、优惠券。
 * 报价为服务端重算（BFF mock：前端传入总价被忽略）；金额对象 {amount, currency}。
 */
const { placeOrder, loading } = useCheckout()

// P5-T08：checkout_cta 业务实验（仅按钮文案变体；关闭/未知 fail-closed → control）
const { assign } = useExperiment()
const ctaLabel = ref('Place Order')
onMounted(async () => {
  const a = await assign('checkout_cta')
  if (a.enabled && a.variant === 'variant_a') ctaLabel.value = 'Place order securely'
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
const shippingRateId = ref('std')
const email = ref('')
const submitting = ref(false)
const submitError = ref<string | null>(null)
const fieldErrors = reactive<Record<string, string>>({})

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
}

const { data: quote, refresh: refreshQuoteBase } = await useAsyncData(
  'checkout-quote',
  () =>
    $fetch<QuoteResponse>('/api/checkout/quote', {
      method: 'POST',
      body: { shippingRateId: shippingRateId.value, couponCode: couponCode.value || undefined },
    }),
  { server: true },
)

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
  fieldErrors.fullName = address.fullName.trim() ? '' : 'Full name is required'
  fieldErrors.province = address.province.trim() ? '' : 'State/Province is required'
  fieldErrors.city = address.city.trim() ? '' : 'City is required'
  fieldErrors.address1 = address.address1.trim() ? '' : 'Street address is required'
  fieldErrors.postcode = address.postcode.trim() ? '' : 'Postcode is required'
  fieldErrors.email = email.value.includes('@') ? '' : 'Valid email is required'
  return Object.values(fieldErrors).every((v) => !v)
}

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
    submitError.value = err instanceof Error ? err.message : 'Failed to place order'
  } finally {
    submitting.value = false
  }
}

useSeo({ title: 'Checkout', description: 'Secure checkout', path: '/checkout' })
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-semibold">Checkout</h1>
    <div class="grid gap-8 lg:grid-cols-2">
      <section>
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Shipping Address</h2>
        <div class="space-y-3">
          <div v-for="key in Object.keys(address) as (keyof typeof address)[]" :key="key" class="space-y-1">
            <label class="block text-xs font-medium text-stone-600" :for="key">{{ key }}</label>
            <input
              :id="key"
              v-model="address[key]"
              class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none"
              :aria-invalid="!!fieldErrors[key]"
              @blur="validateAddress"
            />
            <p v-if="fieldErrors[key]" class="text-xs text-red-600">{{ fieldErrors[key] }}</p>
          </div>
          <div class="space-y-1">
            <label class="block text-xs font-medium text-stone-600" for="email">Email</label>
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

        <h2 class="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-stone-500">Shipping Method</h2>
        <div v-for="rate in quote?.shippingRates ?? []" :key="rate.id" class="mb-2 flex items-center gap-3">
          <input :id="'rate-' + rate.id" v-model="shippingRateId" type="radio" :value="rate.id" name="shippingRate" @change="refreshQuote" />
          <label :for="'rate-' + rate.id" class="text-sm">
            {{ rate.name }} ({{ rate.etaDays }} days) —
            <Price :money="rate.amount" size="sm" />
          </label>
        </div>

        <h2 class="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-stone-500">Coupon</h2>
        <div class="flex gap-2">
          <input
            v-model="couponCode"
            class="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
            placeholder="Coupon code (try WIG10 / EXPIRED10 / USEDOUT10)"
          />
          <button type="button" class="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:border-stone-500" @click="refreshQuote">Apply</button>
        </div>
      </section>

      <section class="rounded-xl border border-stone-200 p-6">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">Order Summary</h2>
        <div v-if="quote" class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-stone-500">Subtotal</span>
            <Price :money="quote.totals.subtotal" size="sm" />
          </div>
          <div class="flex justify-between">
            <span class="text-stone-500">Discount</span>
            <Price :money="quote.totals.discount" size="sm" />
          </div>
          <div class="flex justify-between">
            <span class="text-stone-500">Shipping</span>
            <Price :money="quote.totals.shipping" size="sm" />
          </div>
          <div v-if="quote.deliveryCommitment" class="flex justify-between">
            <span class="text-stone-500">Estimated delivery</span>
            <span class="text-stone-700">{{ quote.deliveryCommitment.deliveryEstimateDays }} business days</span>
          </div>
          <div class="flex justify-between">
            <span class="text-stone-500">Tax</span>
            <Price :money="quote.totals.tax" size="sm" />
          </div>
          <div class="flex justify-between border-t border-stone-200 pt-2 text-base font-semibold">
            <span>Total</span>
            <Price :money="quote.totals.total" size="md" />
          </div>
        </div>
        <p v-else class="text-sm text-stone-500">Add items to your cart to see the order summary.</p>

        <p v-if="submitError" class="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{{ submitError }}</p>

        <button
          type="button"
          class="mt-6 w-full rounded-lg bg-stone-900 px-6 py-3 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
          :disabled="loading || submitting"
          @click="submit"
        >
          {{ submitting ? 'Placing order…' : ctaLabel }}
        </button>
        <p v-if="quote" class="mt-3 text-xs text-stone-400">Quote expires at {{ new Date(quote.expiresAt).toLocaleTimeString() }}</p>
      </section>
    </div>
  </div>
</template>
