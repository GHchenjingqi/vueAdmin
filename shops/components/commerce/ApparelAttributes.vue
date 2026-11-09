<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
/** 服装品类属性展示（P2-T06）：尺码体系/尺码/颜色/面料/版型/测量值/试穿信息。标签接入 i18n（P5-T01）。 */
const { t } = useI18n()
const props = defineProps<{ spec: Record<string, string> }>()
const rows = computed(() =>
  (
    [
      ['sizeSystem', 'attr.sizeSystem'],
      ['size', 'attr.size'],
      ['color', 'attr.color'],
      ['fabric', 'attr.fabric'],
      ['fit', 'attr.fit'],
      ['measurements', 'attr.measurements'],
      ['tryOnInfo', 'attr.tryOnInfo'],
    ] as const
  )
    .map(([key, labelKey]) => ({ key, label: t(labelKey), value: props.spec[key] }))
    .filter((r) => r.value),
)
</script>

<template>
  <dl class="divide-y divide-stone-200 rounded-xl border border-stone-200 text-sm">
    <div v-for="row in rows" :key="row.key" class="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt class="text-stone-500">{{ row.label }}</dt>
      <dd class="text-right font-medium capitalize">{{ row.value }}</dd>
    </div>
  </dl>
</template>
