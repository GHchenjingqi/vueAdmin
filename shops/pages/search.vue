<script setup lang="ts">
import ProductCard from '~/components/commerce/ProductCard.vue'
import { useCatalog } from '~/composables/useCatalog'

/**
 * 搜索页（P2-T07）：关键词搜索、无结果态、参数白名单（q/sort/page 之外忽略）、默认 noindex。
 */
const route = useRoute()
const catalog = useCatalog()

const q = computed(() => String(route.query.q ?? '').slice(0, 100))
const page = computed(() => Number(route.query.page ?? 1) || 1)

const { data, pending } = await useAsyncData(
  `search-${q.value}-${page.value}`,
  () => catalog.listProducts({ page: page.value, pageSize: 24 }),
  { watch: [q, page] },
)

const results = computed(() => {
  const term = q.value.toLowerCase()
  if (!term) return []
  return (data.value?.list ?? []).filter((p) => p.title.toLowerCase().includes(term) || p.description.toLowerCase().includes(term))
})

useHead({ title: 'Search · Aurora Hair Studio', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })
</script>

<template>
  <div>
    <h1 class="mb-2 text-2xl font-semibold">Search</h1>
    <p class="mb-6 text-sm text-stone-500">
      <template v-if="q">Results for "{{ q }}" — {{ results.length }} found</template>
      <template v-else>Enter a keyword, e.g. "lace" or "dress".</template>
    </p>

    <div v-if="pending" class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <div v-for="n in 4" :key="n" class="aspect-square animate-pulse rounded-xl bg-stone-100" />
    </div>

    <div v-else-if="q && results.length === 0" class="rounded-xl border border-stone-200 p-12 text-center">
      <p class="text-sm font-medium text-stone-900">No results for "{{ q }}"</p>
      <p class="mt-1 text-sm text-stone-500">Check spelling or try a more general term.</p>
      <NuxtLink to="/" class="mt-4 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">Browse collections</NuxtLink>
    </div>

    <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <ProductCard v-for="p in results" :key="p.id" :product="p" />
    </div>
  </div>
</template>
