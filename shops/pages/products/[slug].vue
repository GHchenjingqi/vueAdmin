<script setup lang="ts">
import JsonLd from '~/components/commerce/JsonLd.vue'
import WigAttributes from '~/components/commerce/WigAttributes.vue'
import ApparelAttributes from '~/components/commerce/ApparelAttributes.vue'
import VariantSelector from '~/components/commerce/VariantSelector.vue'
import { useStoreConfig } from '~/composables/useStoreConfig'
import { useI18n } from '~/composables/useI18n'
import { trackViewItem, trackAddToCart } from '@shared/analytics/ecommerce'
import ProductReviews from '~/components/commerce/ProductReviews.vue'
import RecommendSection from '~/components/commerce/RecommendSection.vue'
import type { CatalogProduct } from '@shared/types/api'

/**
 * 商品详情页（P2-T04/T05/T06）：变体选择、价格、库存、配送承诺、退货摘要。
 * 不可售 SKU 说明原因（stockNote）而非仅置灰；下架/不存在 → 404 页。文案接入 i18n（P5-T01）。
 */
const { t } = useI18n()
const route = useRoute()
const catalog = useCatalog()
const cart = useCart()
const cfg = useStoreConfig()

const { data: product, error } = await useAsyncData(`product-${route.params.slug}`, () => catalog.getProduct(route.params.slug as string))
if (!product.value) {
  throw createError({ statusCode: 404, statusText: t('product.notFound'), fatal: true })
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

// 跨境 TDK：Title/Description 优先消费后台 per-product SEO 字段（product.seo，后台可配置），
// 缺省回退产品名/描述；Title 用纯文本（品牌由全局 titleTemplate 追加），超 42 字符截断保总长 ≤60；
// description 截断 155；og:type=product；og:image 用产品图。
const productTitle = computed(() => {
  const seoTitle = product.value?.seo?.title?.trim()
  const p = (seoTitle || product.value?.title || t('product.notFound')) as string
  return p.length <= 42 ? p : `${p.slice(0, 39)}…`
})

useSeo({
  title: () => productTitle.value,
  description: () => ((product.value?.seo?.description?.trim() || product.value?.description) ?? '').slice(0, 155),
  keywords: () =>
    product.value ? `${product.value.title}, human hair wig, glueless lace wig, HD lace wig, Aurora Hair Studio` : '',
  ogType: 'product',
  ogImage: () => product.value?.cover ?? '',
  path: `/products/${route.params.slug}`,
})

// P5-T08：product_recommendation 业务实验——控制推荐数量（control=4 / variant_b=8 / variant_c=12）；
// 关闭/未知 fail-closed → control。推荐仅浏览行为，不碰报价与库存。
const { assign: assignExperiment } = useExperiment()
const related = ref<CatalogProduct[]>([])
const relatedStrategy = ref<string>('unknown')
onMounted(async () => {
  const a = await assignExperiment('product_recommendation')
  const count = a.enabled && a.variant === 'variant_c' ? 12 : a.enabled && a.variant === 'variant_b' ? 8 : 4
  // P6：走 /api/recommendations/related（行为优先 + 同分类兜底）；mock 模式 BFF 自动兜底
  try {
    const res = await $fetch<{ items: CatalogProduct[]; strategy: string }>(`/api/recommendations/related`, {
      query: { productId: product.value?.id, limit: count },
    })
    related.value = res.items.filter((p) => p.slug !== product.value?.slug).slice(0, count)
    relatedStrategy.value = res.strategy
  } catch {
    // 端点不可用 → 退回按分类列表（旧行为）
    relatedStrategy.value = 'fallback_category'
    try {
      const res = await catalog.listProducts({ category: product.value?.category?.slug, page: 1, pageSize: count + 1 })
      related.value = res.list.filter((p) => p.slug !== product.value?.slug).slice(0, count)
    } catch {
      related.value = []
    }
  }
})

// 收藏（详情页心形）：游客本地 / 登录云端，进入页面初始化收藏 id 集合
const wishlist = useWishlist()
const wishBusy = ref(false)
const wishAdded = ref(false)
onMounted(async () => {
  await wishlist.load()
})
const isWished = computed(() => (product.value ? wishlist.isWishlisted(product.value.id) : false))
async function toggleWishlist(): Promise<void> {
  if (!product.value || wishBusy.value) return
  wishBusy.value = true
  try {
    if (isWished.value) {
      await wishlist.remove(product.value.id)
    } else {
      await wishlist.add(product.value.id, true)
      wishAdded.value = true
      setTimeout(() => (wishAdded.value = false), 2000)
    }
  } catch {
    // 收藏失败不阻断浏览
  } finally {
    wishBusy.value = false
  }
}
</script>

<template>
  <div>
    <JsonLd v-if="product" :product="product" />
    <nav class="mb-4 text-xs text-stone-500" :aria-label="t('product.breadcrumb')">
      <NuxtLink to="/" class="hover:underline">{{ t('product.home') }}</NuxtLink>
      <span aria-hidden="true">/</span>
      <NuxtLink v-if="product?.category" :to="`/c/${product.category.slug}`" class="hover:underline">{{ product.category.name }}</NuxtLink>
    </nav>

    <div v-if="error || !product" class="rounded-xl border border-stone-200 p-12 text-center">
      <p class="text-sm font-medium text-stone-900">{{ t('product.notFound') }}</p>
      <NuxtLink to="/" class="mt-4 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">{{ t('product.backHome') }}</NuxtLink>
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
              {{ inStock ? t('product.inStock') : t('product.outOfStock') }}
            </span>
          </div>
        </div>

        <p class="text-sm text-stone-600">{{ product.description }}</p>

        <VariantSelector :variants="product.variants" :axes="axes" v-model="spec" />

        <WigAttributes v-if="product.categoryKind === 'wig'" :spec="spec" />
        <ApparelAttributes v-else-if="product.categoryKind === 'apparel'" :spec="spec" />

        <div class="space-y-2 rounded-xl border border-stone-200 p-4 text-xs text-stone-600">
          <p>{{ t('product.ships') }}</p>
          <p>{{ t('product.returns30') }}</p>
        </div>

        <div class="flex items-center gap-3">
          <button
            type="button"
            class="rounded-lg bg-stone-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!inStock || !price"
            @click="addToCart"
          >
            {{ added ? t('product.added') : t('product.addToCart') }}
          </button>
          <button
            type="button"
            class="rounded-lg border px-4 py-3 text-sm font-medium transition disabled:opacity-50"
            :class="isWished ? 'border-red-300 bg-red-50 text-red-600' : 'border-stone-300 text-stone-600 hover:border-stone-500'"
            :disabled="wishBusy"
            :aria-pressed="isWished"
            @click="toggleWishlist"
          >
            <span aria-hidden="true">{{ isWished ? '♥' : '♡' }}</span>
            {{ isWished ? (wishAdded ? t('wishlist.added') : t('wishlist.remove')) : t('wishlist.title') }}
          </button>
          <p v-if="!inStock" class="text-xs text-stone-500">{{ stockNote ?? t('product.unavailable') }}</p>
        </div>
        <p v-if="!wishlist.isLoggedIn()" class="text-xs text-stone-500">{{ t('wishlist.loginToSync') }}</p>
      </div>

      <ProductReviews v-if="product" :spu-id="product.id" class="lg:col-span-2" />
    </div>

    <!-- 最近看过：复用 view_item 埋点，游客/登录均记录 -->
    <ViewHistory :exclude-id="product?.id ?? 0" :limit="8" />

    <!-- P5-T08：product_recommendation 变体 → 推荐数量（control=4 / variant_b=8 / variant_c=12） -->
    <!-- P6 埋点：view_item_list（曝光）+ select_item（点击），CTR 看板用 -->
    <RecommendSection
      :title="t('product.youMayLike')"
      :items="related"
      placement="related"
      :strategy="relatedStrategy"
    />
  </div>
</template>
