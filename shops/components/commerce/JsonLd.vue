<script setup lang="ts">
import type { CatalogProduct } from '@shared/types/api'
import { buildProductJsonLd, buildBreadcrumbJsonLd } from '@shared/seo/product-jsonld'
import { useStoreConfig } from '~/composables/useStoreConfig'
import { useI18n } from '~/composables/useI18n'

/**
 * JSON-LD 结构化数据（P2-T11）：Product offers.priceCurrency 取 store config（禁止写死 C1/C4）。
 * 价格与页面可见价格同源（同一 product.price 数据源）。
 * 注入方式：useHead（@unhead）——模板内 <script> 带副作用会被 Vue 编译器忽略，
 * 故不使用 SFC <template> 中的 <script type="application/ld+json"> 写法。
 * 计算逻辑抽到 @shared/seo/product-jsonld（纯函数），便于单测锁定 aggregateRating 开关。
 */
const props = defineProps<{ product: CatalogProduct }>()
const { currency } = useStoreConfig()
const { t } = useI18n()

const productJsonLd = computed(() => buildProductJsonLd(props.product, currency.value))
const breadcrumbJsonLd = computed(() => buildBreadcrumbJsonLd(props.product, t('product.home')))

useHead({
  script: computed(() => {
    const list: { type: string; innerHTML: string }[] = []
    if (productJsonLd.value) {
      list.push({ type: 'application/ld+json', innerHTML: JSON.stringify(productJsonLd.value) })
    }
    if (breadcrumbJsonLd.value) {
      list.push({ type: 'application/ld+json', innerHTML: JSON.stringify(breadcrumbJsonLd.value) })
    }
    return list
  }),
})
</script>
