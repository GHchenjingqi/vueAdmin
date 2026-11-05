<script setup lang="ts">
/** 假发品类属性展示（P2-T05）：发质/纹理/Lace/长度/密度/帽围/是否 Glueless */
const props = defineProps<{ spec: Record<string, string> }>()
const rows = computed(() =>
  (
    [
      ['hairMaterial', 'Hair Material'],
      ['texture', 'Texture'],
      ['laceType', 'Lace Type'],
      ['capSize', 'Cap Size'],
      ['length', 'Length'],
      ['density', 'Density'],
      ['glueless', 'Glueless'],
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
