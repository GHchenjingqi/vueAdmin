<script setup lang="ts">
import { useCart } from '~/composables/useCart'
import Price from '~/components/commerce/Price.vue'
import { useI18n } from '~/composables/useI18n'
import { buildCartLineAttrs } from '@shared/commerce/cart-line'
import { trackViewCart } from '@shared/analytics/ecommerce'

/**
 * 购物车页（P3-T02）：数量修改、删除、行小计；金额由 Price 组件渲染（配置驱动零硬编码）。
 * 行属性摘要按品类顺序显示（P0 修复：apparel 缺 Size/SizeSystem/Fabric）；文案走 i18n（P5-T01）；
 * locale 由 useLocale() 注入（URL 前缀/cookie 驱动，与币种解耦）。
 */
const { t } = useI18n()
const { items, update, remove, load } = useCart()
await load()

// 行属性摘要（按品类惯用顺序遍历 spec，过滤无值项）
const lineAttrs = (spec: Record<string, string>) =>
  buildCartLineAttrs(spec).map((a) => ({ ...a, label: t(a.labelKey) }))

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

useSeo({ title: () => t('cart.title'), description: () => t('cart.description'), path: '/cart', noindex: true })
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-semibold">{{ t('cart.title') }}</h1>

    <div v-if="(items?.length ?? 0) === 0" class="rounded-xl border border-stone-200 p-12 text-center">
      <p class="text-sm font-medium text-stone-900">{{ t('cart.empty') }}</p>
      <NuxtLink to="/" class="mt-4 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">
        {{ t('cart.backHome') }}
      </NuxtLink>
    </div>

    <template v-else>
      <ul class="divide-y divide-stone-200 rounded-xl border border-stone-200">
        <li v-for="item in items ?? []" :key="item.id" class="flex items-center gap-4 px-4 py-4">
          <div class="h-16 w-16 shrink-0 rounded-lg bg-stone-100" aria-hidden="true"></div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-stone-900">{{ item.title }}</p>
            <p class="text-xs capitalize text-stone-500">
              {{ lineAttrs(item.spec).map((a) => `${a.label}: ${a.value}`).join(' · ') || '—' }}
            </p>
            <p v-if="!item.sellable" class="text-xs text-red-600">{{ t('cart.unavailable') }}</p>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="h-7 w-7 rounded border border-stone-300 text-sm hover:border-stone-500"
              :aria-label="t('cart.decQty')"
              @click="update(item.id, item.qty - 1)"
            >
              −
            </button>
            <span class="w-6 text-center text-sm tabular-nums">{{ item.qty }}</span>
            <button
              type="button"
              class="h-7 w-7 rounded border border-stone-300 text-sm hover:border-stone-500"
              :aria-label="t('cart.incQty')"
              @click="update(item.id, item.qty + 1)"
            >
              +
            </button>
          </div>
          <Price :money="item.lineTotal" size="sm" />
          <button type="button" class="text-xs font-medium text-red-600 hover:text-red-700" @click="remove(item.id)">{{ t('cart.remove') }}</button>
        </li>
      </ul>
      <NuxtLink to="/checkout" class="mt-6 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">
        {{ t('cart.checkout') }}
      </NuxtLink>
    </template>
  </div>
</template>
