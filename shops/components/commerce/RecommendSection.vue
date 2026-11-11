<script setup lang="ts">
import ProductCard from '~/components/commerce/ProductCard.vue'
import { useI18n } from '~/composables/useI18n'

/**
 * 推荐区块（P6）：详情页「看了又看」/ 购物车「买了又买」共用。
 * 纯展示层：父组件负责拉取推荐 items（BFF /api/recommendations/*），空时静默隐藏。
 */
const props = defineProps<{
  title: string
  items: {
    id: number
    slug: string
    title: string
    cover: string | null
    price: { amount: number; currency: string } | null
    inStock: boolean
    category?: { name: string } | null
  }[]
}>()
const { t } = useI18n()
</script>

<template>
  <section v-if="items.length" class="mt-12">
    <h2 class="mb-4 text-lg font-semibold text-stone-900">{{ title }}</h2>
    <ul class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <li v-for="item in items" :key="item.id">
        <ProductCard :product="item" />
      </li>
    </ul>
  </section>
</template>
