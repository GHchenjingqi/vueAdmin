<script setup lang="ts">
import type { CatalogVariant } from '~/shared/types/api'
import Price from './Price.vue'
import StockBadge from '../ui/StockBadge.vue'

const props = defineProps<{ variant: CatalogVariant | null }>()
const config = useStoreConfig()

const price = computed(() => props.variant?.price ?? null)
const inStock = computed(() => props.variant?.inStock ?? false)
const fmtPrice = computed(() => (price.value ? config.format(price.value.amount) : '—'))
</script>

<template>
  <div class="flex items-center gap-3">
    <Price :money="price" size="lg" />
    <StockBadge :tone="inStock ? 'in-stock' : 'out'" />
  </div>
  <p v-if="price" class="sr-only">Price {{ fmtPrice }}</p>
</template>
