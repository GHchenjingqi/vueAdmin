<script setup lang="ts">
/** 服装品类属性展示（P2-T06）：尺码体系/尺码/颜色/面料/版型/测量值/试穿信息 */
const props = defineProps<{ spec: Record<string, string> }>()
const rows = computed(() =>
  (
    [
      ['sizeSystem', 'Size System'],
      ['size', 'Size'],
      ['color', 'Color'],
      ['fabric', 'Fabric'],
      ['fit', 'Fit'],
      ['measurements', 'Measurements'],
      ['tryOnInfo', 'Try-on Info'],
    ] as const
  )
    .map(([key, label]) => ({ key, label, value: props.spec[key] }))
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
