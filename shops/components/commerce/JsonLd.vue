<script setup lang="ts">
import type { CatalogProduct } from '@shared/types/api'
import { useStoreConfig } from '~/composables/useStoreConfig'
import { useI18n } from '~/composables/useI18n'

/**
 * JSON-LD 结构化数据（P2-T11）：Product offers.priceCurrency 取 store config（禁止写死 C1/C4）。
 * 价格与页面可见价格同源（同一 product.price 数据源）。
 * 注入方式：useHead（@unhead）——模板内 <script> 带副作用会被 Vue 编译器忽略，
 * 故不使用 SFC <template> 中的 <script type="application/ld+json"> 写法。
 */
const props = defineProps<{ product: CatalogProduct }>()
const { currency } = useStoreConfig()
const { t } = useI18n()

const productJsonLd = computed(() => {
  const p = props.product.price
  if (!p) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: props.product.title,
    description: props.product.description,
    offers: {
      '@type': 'Offer',
      price: (p.amount / 10 ** currency.value.decimalDigits).toFixed(currency.value.decimalDigits),
      priceCurrency: currency.value.code,
      availability: props.product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  }
})

const breadcrumbJsonLd = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: t('product.home'), item: '/' },
    ...(props.product.category ? [{ '@type': 'ListItem', position: 2, name: props.product.category.name, item: `/c/${props.product.category.slug}` }] : []),
  ],
}))

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
