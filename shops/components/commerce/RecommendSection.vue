<script setup lang="ts">
import ProductCard from '~/components/commerce/ProductCard.vue'
import { trackEvent } from '@shared/analytics/events'
import { useStoreConfig } from '~/composables/useStoreConfig'

/**
 * 推荐区块（P6）：详情页「看了又看」/ 购物车「买了又买」共用。
 * 埋点（P6 效果看板）：
 * - 挂载 + items 非空 → view_item_list（placement/strategy/items[]）
 * - 点击产品卡 → select_item（placement/strategy/position/item_id）
 * 幂等：trackEvent 内部生成 eventId，GA4 + 服务端双通道（consent 门控在 trackEvent 内）。
 */
interface RecoItem {
  id: number
  slug: string
  title: string
  cover: string | null
  price: { amount: number; currency: string } | null
  inStock: boolean
  category?: { name: string } | null
}

const props = defineProps<{
  title: string
  items: RecoItem[]
  /** 推荐位标识：related（详情页看了又看）| cross_sell（购物车买了又买） */
  placement: 'related' | 'cross_sell'
  /** 推荐策略（后端返回）：coPurchase / sameCategory / mixed / none */
  strategy?: string
}>()

const cfg = useStoreConfig()

// 曝光：items 非空时发一次（key 变化时重新曝光，如实验变体切换）
watch(
  () => [props.items.length, props.placement, props.strategy] as const,
  ([len, placement, strategy], oldValue) => {
    if (len === 0) return
    const prevLen = oldValue?.[0]
    if (prevLen === len && prevLen > 0) return // 已曝光过且 items 未变
    trackEvent('view_item_list', {
      placement,
      strategy: strategy ?? 'unknown',
      item_list_id: placement,
      item_list_name: props.title,
      items: props.items.slice(0, 12).map((it, idx) => ({
        item_id: it.id,
        item_name: it.title,
        index: idx + 1,
        placement,
        strategy: strategy ?? 'unknown',
      })),
    })
  },
  { immediate: true, flush: 'post' },
)

/** 点击产品卡（ProductCard 是 NuxtLink，需在点击时主动埋点） */
function trackClick(item: RecoItem, index: number): void {
  trackEvent('select_item', {
    placement: props.placement,
    strategy: props.strategy ?? 'unknown',
    item_list_id: props.placement,
    item_list_name: props.title,
    position: index + 1,
    currency: item.price?.currency ?? cfg.currency.value,
    value: (item.price?.amount ?? 0) / 100,
    items: [
      {
        item_id: item.id,
        item_name: item.title,
        index: index + 1,
        placement: props.placement,
        strategy: props.strategy ?? 'unknown',
      },
    ],
  })
  // 不阻断默认跳转（NuxtLink 导航照常）
}
</script>

<template>
  <section v-if="items.length" class="mt-12">
    <h2 class="mb-4 text-lg font-semibold text-stone-900">{{ title }}</h2>
    <ul class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <li v-for="(item, idx) in items" :key="item.id">
        <ProductCard :product="item" @click="trackClick(item, idx)" />
      </li>
    </ul>
  </section>
</template>
