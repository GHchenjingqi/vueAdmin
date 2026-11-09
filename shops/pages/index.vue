<script setup lang="ts">
import ProductCard from '~/components/commerce/ProductCard.vue'
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()
const catalog = useCatalog()
const siteUrl = useRuntimeConfig().public.siteUrl as string
const { data: categories } = await useAsyncData('home-categories', () => catalog.loadCategories())
const { data: featured } = await useAsyncData('home-featured', () => catalog.listProducts({ pageSize: 8 }))

useSeo({
  title: () => t('home.heroTitle'),
  description: () => `${t('home.heroSubtitle')} Shop HD lace wigs, body wave & deep wave human hair wigs, plus apparel. Free standard shipping over $99, 30-day returns.`,
  keywords: () =>
    'HD lace wigs, glueless wigs, human hair wigs, lace front wigs, body wave wig, deep wave wig, pre-plucked lace wig, natural hairline wig, hair studio',
  ogType: 'website',
  ogImage: () => featured.value?.list?.[0]?.cover ?? '',
  path: '/',
})

// 跨境独立站首页结构化数据：Organization + WebSite（含站内搜索）。
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Aurora Hair Studio', url: siteUrl }),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Aurora Hair Studio',
        url: siteUrl,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${siteUrl}/search?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      }),
    },
  ],
})
</script>

<template>
  <div class="space-y-10">
    <section class="rounded-2xl bg-stone-900 px-6 py-14 text-center text-white">
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{{ t('home.heroTitle') }}</h1>
      <p class="mx-auto mt-3 max-w-xl text-sm text-stone-300">{{ t('home.heroSubtitle') }}</p>
      <NuxtLink to="/c/lace-wigs" class="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-stone-900 hover:bg-stone-100">
        {{ t('home.shopLaceWigs') }}
      </NuxtLink>
    </section>

    <section>
      <h2 class="mb-4 text-lg font-semibold">{{ t('home.shopByCategory') }}</h2>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <NuxtLink
          v-for="cat in categories ?? []"
          :key="cat.id"
          :to="`/c/${cat.slug}`"
          class="rounded-xl border border-stone-200 px-4 py-6 text-center hover:border-stone-400"
        >
          <span class="text-sm font-medium">{{ cat.name }}</span>
        </NuxtLink>
      </div>
    </section>

    <section>
      <h2 class="mb-4 text-lg font-semibold">{{ t('home.bestSellers') }}</h2>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <ProductCard v-for="p in featured?.list ?? []" :key="p.id" :product="p" />
      </div>
    </section>
  </div>
</template>
