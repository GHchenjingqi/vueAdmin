<script setup lang="ts">
import JsonLd from '~/components/commerce/JsonLd.vue'
import WigAttributes from '~/components/commerce/WigAttributes.vue'
import ApparelAttributes from '~/components/commerce/ApparelAttributes.vue'
import VariantSelector from '~/components/commerce/VariantSelector.vue'
import { useStoreConfig } from '~/composables/useStoreConfig'
import { trackViewItem, trackAddToCart } from '@shared/analytics/ecommerce'

/**
 * 商品详情页（P2-T04/T05/T06）：变体选择、价格、库存、配送承诺、退货摘要。
 * 不可售 SKU 说明原因（stockNote）而非仅置灰；下架/不存在 → 404 页。
 */
const route = useRoute()
const catalog = useCatalog()
const cart = useCart()
const cfg = useStoreConfig()

const { data: product, error } = await useAsyncData(`product-${route.params.slug}`, () => catalog.getProduct(route.params.slug as string))
if (!product.value) {
  throw createError({ statusCode: 404, statusText: 'Product not found', fatal: true })
}

// P2-T12：slug 规范化——同一商品经旧 slug/纯 id 抵达时 301 到 canonical slug（SEO_SPEC §7；410 策略待后台重定向表）
if (product.value.slug && product.value.slug !== route.params.slug) {
  await navigateTo(`/products/${product.value.slug}`, { redirectCode: 301, replace: true })
}

const axes = computed(() => {
  const v0 = product.value?.variants[0]
  return v0 ? Object.keys(v0.spec).slice(0, 4) : []
})

const spec = ref<Record<string, string>>({})
watchEffect(() => {
  if (product.value && product.value.variants[0]) {
    spec.value = { ...product.value.variants[0].spec }
  }
})

const variant = computed(() => {
  if (!product.value) return null
  return catalog.variantOf(product.value, spec.value) ?? product.value.variants[0]
})
const price = computed(() => variant.value?.price ?? product.value?.price ?? null)
const priceText = computed(() => (price.value ? cfg.format(price.value.amount) : '—'))
const inStock = computed(() => variant.value?.inStock ?? false)
const stockNote = computed(() => variant.value?.stockNote)
const added = ref(false)

async function addToCart(): Promise<void> {
  if (!variant.value || !inStock.value || !variant.value.price) return
  await cart.add(variant.value.id, 1)
  trackAddToCart({ skuId: variant.value.id, title: product.value?.title ?? '', qty: 1, unit: variant.value.price })
  added.value = true
  setTimeout(() => (added.value = false), 2500)
}

// P4-T10：view_item（价格来自页面可见值，与 store config 同源）
watchEffect(() => {
  if (product.value && variant.value?.price) {
    trackViewItem({ skuId: variant.value.id, title: product.value.title, qty: 1, unit: variant.value.price })
  }
})

useSeo({
  title: product.value?.title ?? 'Product',
  description: product.value?.description ?? '',
  path: `/products/${route.params.slug}`,
})
</script>

<template>
  <div>
    <JsonLd v-if="product" :product="product" />
    <nav class="mb-4 text-xs text-stone-500" aria-label="Breadcrumb">
      <NuxtLink to="/" class="hover:underline">Home</NuxtLink>
      <span aria-hidden="true"> / </span>
      <NuxtLink v-if="product?.category" :to="`/c/${product.category.slug}`" class="hover:underline">{{ product.category.name }}</NuxtLink>
    </nav>

    <div v-if="error || !product" class="rounded-xl border border-stone-200 p-12 text-center">
      <p class="text-sm font-medium text-stone-900">Product not found</p>
      <NuxtLink to="/" class="mt-4 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">Back to home</NuxtLink>
    </div>

    <div v-else class="grid gap-8 lg:grid-cols-2">
      <div>
        <div class="aspect-square w-full overflow-hidden rounded-2xl bg-stone-100">
          <img v-if="product.cover" :src="product.cover" :alt="product.title" width="1200" height="1200" class="h-full w-full object-cover" />
          <div v-else class="flex h-full w-full items-center justify-center text-6xl text-stone-300" aria-hidden="true">✦</div>
        </div>
      </div>

      <div class="space-y-6">
        <div>
          <h1 class="text-2xl font-semibold">{{ product.title }}</h1>
          <div class="mt-2 flex items-center gap-3">
            <span class="text-2xl font-semibold tabular-nums">{{ priceText }}</span>
            <span class="rounded-full px-2.5 py-0.5 text-xs font-medium" :class="inStock ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-500'">
              {{ inStock ? 'In stock' : 'Out of stock' }}
            </span>
          </div>
        </div>

        <p class="text-sm text-stone-600">{{ product.description }}</p>

        <VariantSelector :variants="product.variants" :axes="axes" v-model="spec" />

        <WigAttributes v-if="product.categoryKind === 'wig'" :spec="spec" />
        <ApparelAttributes v-else-if="product.categoryKind === 'apparel'" :spec="spec" />

        <div class="space-y-2 rounded-xl border border-stone-200 p-4 text-xs text-stone-600">
          <p>🚚 Ships in 1-2 business days · Standard 7-12 days / Express 3-5 days</p>
          <p>↩️ 30-day returns · items must be unworn with original packaging</p>
        </div>

        <div class="flex items-center gap-3">
          <button
            type="button"
            class="rounded-lg bg-stone-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!inStock"
            @click="addToCart"
          >
            {{ added ? 'Added ✓' : 'Add to Cart' }}
          </button>
          <p v-if="!inStock" class="text-xs text-stone-500">{{ stockNote ?? 'Currently unavailable' }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
