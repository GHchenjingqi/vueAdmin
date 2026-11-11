<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useViewHistory } from '~/composables/useViewHistory'
import { useCatalog } from '~/composables/useCatalog'
import { useI18n } from '~/composables/useI18n'
import type { CatalogProduct } from '@shared/types/api'

/**
 * 最近看过组件（商品详情页 / 首页可复用）：
 * 数据源复用 trackViewItem 埋点（/api/view-history），skuId→productId 后端已映射，
 * 列表渲染复用 catalog ids 批量取 + ProductCard。登录/游客均可（游客按 sessionId）。
 */
const { t } = useI18n()
const viewHistory = useViewHistory()
const catalog = useCatalog()

const items = ref<CatalogProduct[]>([])
const loading = ref(false)

const props = withDefaults(defineProps<{ limit?: number; excludeId?: number }>(), { limit: 8, excludeId: 0 })

onMounted(async () => {
  loading.value = true
  try {
    const detail = await viewHistory.listDetail(async (ids) => {
      const res = await catalog.listProducts({ ids, pageSize: ids.length })
      return res.list as unknown as CatalogProduct[]
    }, props.limit + (props.excludeId ? 1 : 0))
    items.value = detail.map((d) => d.product).filter((p) => p.id !== props.excludeId).slice(0, props.limit)
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section v-if="items.length" class="mt-14" :aria-label="t('history.title')">
    <h2 class="mb-5 text-lg font-semibold">{{ t('history.title') }}</h2>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <ProductCard v-for="p in items" :key="p.id" :product="p" />
    </div>
  </section>
</template>
