<script setup lang="ts">
import ProductCard from '~/components/commerce/ProductCard.vue'
import { useCatalog } from '~/composables/useCatalog'
import { useI18n } from '~/composables/useI18n'
import { fetchSearchSuggest, fetchHotKeywords, fetchSearchFallback, trackSearch } from '~/composables/useSearch'
import type { CatalogProduct } from '@shared/types/api'

/**
 * 搜索页（P2-T07 → P6 增强）：真后端 keyword 搜索 + 纠错建议 + 热搜词 + 无结果兜底 + search 埋点。
 * 参数白名单：q/sort/page 之外忽略；默认 noindex。
 */
const { t, ti } = useI18n()
const route = useRoute()
const catalog = useCatalog()

const q = computed(() => String(route.query.q ?? '').slice(0, 100))
const page = computed(() => Number(route.query.page ?? 1) || 1)

// ---- 主搜索结果（复用 catalog.listProducts keyword） ----
const { data, pending } = await useAsyncData(
  `search-${q.value}-${page.value}`,
  () => catalog.listProducts({ page: page.value, pageSize: 24 }),
  { watch: [q, page] },
)
const results = computed(() => {
  const list = data.value?.list ?? []
  const term = q.value.toLowerCase().trim()
  if (!term) return []
  // 客户端轻过滤：与后端 keyword filter 叠加，防止 sort 参数污染
  return list.filter((p) => p.title.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term))
})

// ---- 纠错建议（有结果但用户拼写可疑时展示） ----
const suggestions = ref<string[]>([])
watchEffect(async () => {
  const term = q.value.trim()
  if (!term || term.length < 2 || results.value.length > 0) { suggestions.value = []; return }
  const res = await fetchSearchSuggest(term, 5)
  suggestions.value = res.suggestions
})

// ---- 热搜词（无 q 时展示） ----
const hotKeywords = ref<{ term: string; count: number }[]>([])
onMounted(async () => {
  if (!q.value) {
    const res = await fetchHotKeywords(7, 8)
    hotKeywords.value = res.keywords
  }
})

// ---- 无结果兜底商品（0 结果时展示） ----
const fallbackItems = ref<CatalogProduct[]>([])
const fallbackStrategy = ref<'category' | 'hot' | 'none'>('none')
watchEffect(async () => {
  const term = q.value.trim()
  if (!term || results.value.length > 0) { fallbackItems.value = []; fallbackStrategy.value = 'none'; return }
  const res = await fetchSearchFallback(term, 8)
  fallbackItems.value = res.items
  fallbackStrategy.value = res.strategy
})

// ---- search 埋点（等结果返回后上报，带真实 results 数供零结果率统计） ----
const trackedTerm = ref('')
watch([q, pending], ([val, isPending]) => {
  const term = String(val ?? '').trim()
  if (isPending || !term || term === trackedTerm.value) return
  trackedTerm.value = term
  trackSearch(term, results.value.length)
}, { immediate: true })

useSeo({
  title: () => t('search.title'),
  description: () => `${t('search.hint')} Search HD lace wigs, human hair wigs and apparel.`,
  path: '/search',
  noindex: true,
})
</script>

<template>
  <div>
    <h1 class="mb-2 text-2xl font-semibold">{{ t('search.title') }}</h1>
    <p class="mb-6 text-sm text-stone-500">
      <template v-if="q">{{ ti('search.results', { q, n: String(results.length) }) }}</template>
      <template v-else>{{ t('search.hint') }}</template>
    </p>

    <!-- 热搜词（无搜索词时展示） -->
    <div v-if="!q && hotKeywords.length" class="mb-6 flex flex-wrap gap-2">
      <span class="text-xs text-stone-400 self-center mr-1">{{ t('search.hotLabel') }}</span>
      <NuxtLink
        v-for="kw in hotKeywords" :key="kw.term"
        :to="`/search?q=${encodeURIComponent(kw.term)}`"
        class="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700 hover:bg-stone-200 transition-colors"
      >{{ kw.term }}</NuxtLink>
    </div>

    <!-- 纠错建议 -->
    <div v-if="q && results.length === 0 && suggestions.length" class="mb-4 flex flex-wrap items-center gap-2">
      <span class="text-xs text-stone-500">{{ t('search.suggestionsLabel') }}</span>
      <NuxtLink
        v-for="s in suggestions" :key="s"
        :to="`/search?q=${encodeURIComponent(s)}`"
        class="rounded-md border border-stone-200 px-2.5 py-1 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
      >{{ s }}</NuxtLink>
    </div>

    <div v-if="pending" class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <div v-for="n in 4" :key="n" class="aspect-square animate-pulse rounded-xl bg-stone-100" />
    </div>

    <!-- 无结果 + 兜底 -->
    <div v-else-if="q && results.length === 0" class="rounded-xl border border-stone-200 p-12 text-center">
      <p class="text-sm font-medium text-stone-900">{{ ti('search.noResults', { q }) }}</p>
      <p class="mt-1 text-sm text-stone-500">{{ t('search.spelling') }}</p>
      <NuxtLink to="/" class="mt-4 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">
        {{ t('search.browse') }}
      </NuxtLink>

      <!-- 兜底热门商品 -->
      <div v-if="fallbackItems.length" class="mt-8 text-left">
        <h2 class="mb-3 text-sm font-medium text-stone-900">{{ t('search.fallbackTitle') }}</h2>
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <ProductCard v-for="p in fallbackItems" :key="p.id" :product="p" />
        </div>
      </div>
    </div>

    <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <ProductCard v-for="p in results" :key="p.id" :product="p" />
    </div>
  </div>
</template>
