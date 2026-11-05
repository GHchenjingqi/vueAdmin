<script setup lang="ts">
import { useCart } from '~/composables/useCart'
import Price from '~/components/commerce/Price.vue'
import { translate, type Locale } from '@shared/i18n/messages'
import { trackViewCart } from '@shared/analytics/ecommerce'

/**
 * 购物车页（P3-T02）：数量修改、删除、行小计；金额由 Price 组件渲染（配置驱动零硬编码）。
 * 文案走 i18n（P1-T05）；locale 由 useStoreConfig 注入。
 */
const { items, update, remove, load } = useCart()
await load()

// P4-T10：view_cart（金额取行合计，币种随购物车）
watchEffect(() => {
  const list = items.value ?? []
  if (list.length === 0) return
  const currency = list[0]?.lineTotal.currency ?? 'USD'
  trackViewCart(
    list.map((i) => ({ skuId: i.skuId, title: i.title, qty: i.qty, unit: i.unit })),
    { amount: list.reduce((n, i) => n + i.lineTotal.amount, 0), currency },
  )
})

const cfg = useStoreConfig()
const t = (key: string) => translate((cfg.market.value.language as Locale) ?? 'en-US', key)

useSeo({ title: 'Cart', description: 'Your shopping cart', path: '/cart' })
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-semibold">{{ t('cart.title') }}</h1>

    <div v-if="(items?.length ?? 0) === 0" class="rounded-xl border border-stone-200 p-12 text-center">
      <p class="text-sm font-medium text-stone-900">{{ t('cart.empty') }}</p>
      <NuxtLink to="/" class="mt-4 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">{{ t('cart.backHome') }}</NuxtLink>
    </div>

    <template v-else>
      <ul class="divide-y divide-stone-200 rounded-xl border border-stone-200">
        <li v-for="item in items ?? []" :key="item.id" class="flex items-center gap-4 px-4 py-4">
          <div class="h-16 w-16 shrink-0 rounded-lg bg-stone-100" aria-hidden="true"></div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-stone-900">{{ item.title }}</p>
            <p class="text-xs capitalize text-stone-500">{{ [item.spec?.texture, item.spec?.length && item.spec.length + '"', item.spec?.color].filter(Boolean).join(' · ') || '—' }}</p>
            <p v-if="!item.sellable" class="text-xs text-red-600">This item is no longer available</p>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="h-7 w-7 rounded border border-stone-300 text-sm hover:border-stone-500" aria-label="Decrease quantity" @click="update(item.id, item.qty - 1)">−</button>
            <span class="w-6 text-center text-sm tabular-nums">{{ item.qty }}</span>
            <button type="button" class="h-7 w-7 rounded border border-stone-300 text-sm hover:border-stone-500" aria-label="Increase quantity" @click="update(item.id, item.qty + 1)">+</button>
          </div>
          <Price :money="item.lineTotal" size="sm" />
          <button type="button" class="text-xs text-stone-500 hover:text-stone-900" @click="remove(item.id)">Remove</button>
        </li>
      </ul>
      <NuxtLink to="/checkout" class="mt-6 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">Checkout</NuxtLink>
    </template>
  </div>
</template>
