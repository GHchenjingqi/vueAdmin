<script setup lang="ts">
/**
 * 尺码指南页（C-尺寸指南）：测量说明 + 假发帽围/服装尺码对照表 + 选码提示。
 * 纯静态 i18n 内容，零后端。数据为行业通用参考值；买家下单仍以商品详情 spec 为准。
 */
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()

/** 假发帽围（cm, inch）：S/M/L + 可调节说明 */
const wigSizes = [
  { size: 'S', cm: '54–55', inch: '21.25–21.65' },
  { size: 'M', cm: '56–57', inch: '22.05–22.44' },
  { size: 'L', cm: '58–59', inch: '22.83–23.23' },
  { size: 'XL', cm: '60–61', inch: '23.62–24.02' },
]

/** 服装尺码（cm）：XS–XL + 胸/腰/臀 */
const apparelSizes = [
  { size: 'XS', chest: '78–82', waist: '60–64', hip: '84–88' },
  { size: 'S', chest: '83–87', waist: '65–69', hip: '89–93' },
  { size: 'M', chest: '88–93', waist: '70–75', hip: '94–99' },
  { size: 'L', chest: '94–99', waist: '76–81', hip: '100–105' },
  { size: 'XL', chest: '100–106', waist: '82–88', hip: '106–112' },
]

useSeo({
  title: () => t('sizeGuide.title'),
  description: () => t('sizeGuide.intro'),
  keywords: () => 'size guide, wig cap size, apparel size chart, head circumference, measurement',
  path: '/size-guide',
})
</script>

<template>
  <article class="mx-auto max-w-3xl">
    <h1 class="mb-2 text-2xl font-semibold">{{ t('sizeGuide.title') }}</h1>
    <p class="mb-8 text-sm text-stone-600">{{ t('sizeGuide.intro') }}</p>

    <section class="mb-10" aria-labelledby="size-measure">
      <h2 id="size-measure" class="mb-3 text-lg font-semibold">{{ t('sizeGuide.measureTitle') }}</h2>
      <ul class="list-disc space-y-2 pl-5 text-sm text-stone-700">
        <li>{{ t('sizeGuide.measureHead') }}</li>
        <li>{{ t('sizeGuide.measureBody') }}</li>
      </ul>
    </section>

    <section class="mb-10" aria-labelledby="size-wig">
      <h2 id="size-wig" class="mb-3 text-lg font-semibold">{{ t('sizeGuide.wigTitle') }}</h2>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr class="border-b border-stone-300 text-left text-stone-600">
              <th class="py-2 pr-4 font-medium">{{ t('sizeGuide.size') }}</th>
              <th class="py-2 pr-4 font-medium">{{ t('sizeGuide.circumference') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in wigSizes" :key="row.size" class="border-b border-stone-200">
              <td class="py-2 pr-4 font-medium">{{ row.size }}</td>
              <td class="py-2 pr-4 text-stone-700">{{ row.cm }} / {{ row.inch }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="mb-10" aria-labelledby="size-apparel">
      <h2 id="size-apparel" class="mb-3 text-lg font-semibold">{{ t('sizeGuide.apparelTitle') }}</h2>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr class="border-b border-stone-300 text-left text-stone-600">
              <th class="py-2 pr-4 font-medium">{{ t('sizeGuide.size') }}</th>
              <th class="py-2 pr-4 font-medium">{{ t('sizeGuide.chest') }}</th>
              <th class="py-2 pr-4 font-medium">{{ t('sizeGuide.waist') }}</th>
              <th class="py-2 pr-4 font-medium">{{ t('sizeGuide.hip') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in apparelSizes" :key="row.size" class="border-b border-stone-200">
              <td class="py-2 pr-4 font-medium">{{ row.size }}</td>
              <td class="py-2 pr-4 text-stone-700">{{ row.chest }}</td>
              <td class="py-2 pr-4 text-stone-700">{{ row.waist }}</td>
              <td class="py-2 pr-4 text-stone-700">{{ row.hip }}</td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2 text-xs text-stone-400">cm</p>
      </div>
    </section>

    <p class="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">{{ t('sizeGuide.tip') }}</p>
  </article>
</template>
