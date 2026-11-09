<script setup lang="ts">
import { useCatalog } from '~/composables/useCatalog'
import ProductCard from '~/components/commerce/ProductCard.vue'
import { useI18n } from '~/composables/useI18n'

/**
 * 集合页（P2-T03）：筛选、排序、分页、空状态；筛选组合可分享 URL；分页与 Canonical 符合 SEO_SPEC。
 * 文案接入 i18n（P5-T01）。
 */
const { t, ti } = useI18n()
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

// 跨境独立站 TDK：类目级 Title/Description/Keywords（英文站，面向目标市场）。
const CATEGORY_SEO: Record<string, { name: string; desc: string; keywords: string }> = {
  'lace-wigs': {
    name: 'Lace Wigs',
    desc: 'Shop premium lace wigs at Aurora Hair Studio: HD lace & full lace, glueless install, 100% human hair, natural hairline. Free standard shipping over $99.',
    keywords: 'lace wigs, lace front wigs, glueless wigs, human hair wigs, HD lace wig, full lace wig',
  },
  'hd-lace': {
    name: 'HD Lace Wigs',
    desc: 'Invisible HD lace wigs with pre-plucked baby hair, glueless install in minutes. 100% human hair, 180% density. Free standard shipping over $99.',
    keywords: 'HD lace wig, invisible lace wig, pre-plucked lace wig, glueless HD lace wig, HD lace front wig',
  },
  'full-lace': {
    name: 'Full Lace Wigs',
    desc: 'Full lace wigs with a natural hairline, 100% human hair, 180% density. Pre-plucked and glueless-ready. Free standard shipping over $99.',
    keywords: 'full lace wig, full lace front wig, human hair full lace wig, natural hairline wig',
  },
  apparel: {
    name: 'Apparel',
    desc: 'Shop Aurora Hair Studio apparel: dresses, summer slip dresses and more. Quality fabrics, free standard shipping over $99.',
    keywords: 'apparel, dresses, women fashion, summer dress, slip dress',
  },
  dresses: {
    name: 'Dresses',
    desc: 'Shop dresses at Aurora Hair Studio: summer slip dresses and more. Quality fabrics, free standard shipping over $99.',
    keywords: 'dresses, summer dress, slip dress, women dress, fashion dress',
  },
}
const humanize = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

useSeo({
  title: () => CATEGORY_SEO[category.value]?.name ?? humanize(category.value),
  description: () =>
    CATEGORY_SEO[category.value]?.desc ??
    `Shop ${humanize(category.value)} at Aurora Hair Studio. Free standard shipping over $99, 30-day returns.`,
  keywords: () => CATEGORY_SEO[category.value]?.keywords ?? category.value.replace(/-/g, ', '),
  path: `/c/${category.value}`,
})
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-semibold capitalize">{{ category.replace(/-/g, ' ') }}</h1>

    <div class="mb-6 flex flex-wrap items-center gap-2 text-sm">
      <span class="text-stone-500">{{ t('category.sort') }}</span>
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

    <div v-else-if="error" class="rounded-xl border border-stone-200 p-8 text-center text-sm text-stone-600">{{ ti('category.error', { msg: String(error) }) }}</div>

    <template v-else>
      <div v-if="(data?.list?.length ?? 0) === 0" class="rounded-xl border border-stone-200 p-12 text-center">
        <p class="text-sm font-medium text-stone-900">{{ t('category.noProducts') }}</p>
        <p class="mt-1 text-sm text-stone-500">{{ t('category.adjust') }}</p>
        <NuxtLink to="/" class="mt-4 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">
          {{ t('category.backHome') }}
        </NuxtLink>
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
