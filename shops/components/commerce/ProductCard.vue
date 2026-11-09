<script setup lang="ts">
import { useStoreConfig } from '~/composables/useStoreConfig'
import { useI18n } from '~/composables/useI18n'

const props = defineProps<{
  product: {
    id: number
    slug: string
    title: string
    cover: string | null
    price: { amount: number; currency: string } | null
    inStock: boolean
    category?: { name: string } | null
  }
}>()
const { t } = useI18n()
const cfg = useStoreConfig()
const link = computed(() => `/products/${props.product.slug}`)
const priceText = computed(() => (props.product.price ? cfg.format(props.product.price.amount) : '—'))
</script>

<template>
  <NuxtLink :to="link" class="group block">
    <div class="aspect-square w-full overflow-hidden rounded-xl bg-stone-100">
      <img
        v-if="product.cover"
        :src="product.cover"
        :alt="product.title"
        width="600"
        height="600"
        class="h-full w-full object-cover transition group-hover:scale-105"
      />
      <div v-else class="flex h-full w-full items-center justify-center text-stone-400">
        <span class="text-sm">{{ product.category?.name ?? 'Aurora' }}</span>
      </div>
    </div>
    <h3 class="mt-3 line-clamp-2 text-sm font-medium text-stone-900 group-hover:underline">{{ product.title }}</h3>
    <div class="mt-1 flex items-center gap-2">
      <span class="text-sm tabular-nums">{{ priceText }}</span>
      <span v-if="!product.inStock" class="rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-medium text-stone-500">{{ t('card.outOfStock') }}</span>
    </div>
  </NuxtLink>
</template>
