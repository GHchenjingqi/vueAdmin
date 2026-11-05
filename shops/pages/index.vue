<script setup lang="ts">
import ProductCard from '~/components/commerce/ProductCard.vue'

const catalog = useCatalog()
const { data: categories } = await useAsyncData('home-categories', () => catalog.loadCategories())
const { data: featured } = await useAsyncData('home-featured', () => catalog.listProducts({ pageSize: 8 }))

useSeo({
  title: 'Glueless Wigs & Apparel — Aurora Hair Studio',
  description: 'HD lace glueless wigs, human hair wigs and apparel. Free standard shipping on orders over $99.',
  path: '/',
})
</script>

<template>
  <div class="space-y-10">
    <section class="rounded-2xl bg-stone-900 px-6 py-14 text-center text-white">
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">Glueless Wigs, Melted in Minutes</h1>
      <p class="mx-auto mt-3 max-w-xl text-sm text-stone-300">
        Pre-cut HD lace, 100% human hair, 180% density. Free standard shipping on orders over $99.
      </p>
      <NuxtLink to="/c/lace-wigs" class="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-stone-900 hover:bg-stone-100">
        Shop Lace Wigs
      </NuxtLink>
    </section>

    <section>
      <h2 class="mb-4 text-lg font-semibold">Shop by Category</h2>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <NuxtLink v-for="cat in categories ?? []" :key="cat.id" :to="`/c/${cat.slug}`" class="rounded-xl border border-stone-200 px-4 py-6 text-center hover:border-stone-400">
          <span class="text-sm font-medium">{{ cat.name }}</span>
        </NuxtLink>
      </div>
    </section>

    <section>
      <h2 class="mb-4 text-lg font-semibold">Best Sellers</h2>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <ProductCard v-for="p in featured?.list ?? []" :key="p.id" :product="p" />
      </div>
    </section>
  </div>
</template>
