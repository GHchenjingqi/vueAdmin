<script setup lang="ts">
import { useCatalog } from '~/composables/useCatalog'
import ProductCard from '~/components/commerce/ProductCard.vue'

/**
 * 集合页（P2-T03）：筛选、排序、分页、空状态；筛选组合可分享 URL；分页与 Canonical 符合 SEO_SPEC。
 */
const route = useRoute()
const { listProducts } = useCatalog()

const page = computed(() => Number(route.query.page ?? 1) || 1)
const sort = computed(() => String(route.query.sort ?? 'newest'))
const category = computed(() => String(route.params.slug ?? ''))

const { data, pending, error } = await useAsyncData(
  `collection-${category.value}-${sort.value}-${page.value}`,
  () => listProducts({ category: category.value, sort: sort.value, page: page.value, pageSize: 24 }),
  { watch: [() => route.query.page, () => route.query.sort] },
)

const totalPages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / (data.value?.pageSize ?? 24))))
const sortOptions = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
]

useSeo({
  title: `${category.value.replace(/-/g, ' ')} — Aurora Hair Studio`,
  description: `Shop ${category.value.replace(/-/g, ' ')} at Aurora Hair Studio. Filter, sort and find your perfect fit.`,
  path: `/c/${category.value}`,
})
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-semibold capitalize">{{ category.replace(/-/g, ' ') }}</h1>

    <div class="mb-6 flex flex-wrap items-center gap-2 text-sm">
      <span class="text-stone-500">Sort:</span>
      <NuxtLink
        v-for="opt in sortOptions"
        :key="opt.value"
        :to="{ path: route.path, query: { ...route.query, sort: opt.value } }"
        class="rounded-lg border px-3 py-1.5"
        :class="sort === opt.value ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 hover:border-stone-500'"
      >
        {{ opt.label }}
      </NuxtLink>
    </div>

    <div v-if="pending" class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <div v-for="n in 8" :key="n" class="aspect-square animate-pulse rounded-xl bg-stone-100" />
    </div>

    <div v-else-if="error" class="rounded-xl border border-stone-200 p-8 text-center text-sm text-stone-600">
      {{ error }} — try adjusting filters.
    </div>

    <template v-else>
      <div v-if="(data?.list?.length ?? 0) === 0" class="rounded-xl border border-stone-200 p-12 text-center">
        <p class="text-sm font-medium text-stone-900">No products found</p>
        <p class="mt-1 text-sm text-stone-500">Try adjusting filters or browse all categories.</p>
        <NuxtLink to="/" class="mt-4 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">Back to home</NuxtLink>
      </div>
      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <ProductCard v-for="p in data?.list ?? []" :key="p.id" :product="p" />
      </div>
    </template>

    <nav v-if="(totalPages ?? 1) > 1" class="mt-8 flex justify-center gap-2" aria-label="Pagination">
      <NuxtLink
        v-for="pg in totalPages"
        :key="pg"
        :to="{ path: route.path, query: { ...route.query, page: pg } }"
        class="rounded-lg border px-3 py-1.5 text-sm"
        :class="pg === page ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 hover:border-stone-500'"
      >
        {{ pg }}
      </NuxtLink>
    </nav>
  </div>
</template>
