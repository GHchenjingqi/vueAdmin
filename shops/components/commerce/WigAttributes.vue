<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
/** 假发品类属性展示（P2-T05）：发质/纹理/Lace/长度/密度/帽围/是否 Glueless。标签接入 i18n（P5-T01）。 */
const { t } = useI18n()
const props = defineProps<{ spec: Record<string, string> }>()
const rows = computed(() =>
  (
    [
      ['hairMaterial', 'attr.hairMaterial'],
      ['texture', 'attr.texture'],
      ['laceType', 'attr.laceType'],
      ['capSize', 'attr.capSize'],
      ['length', 'attr.length'],
      ['density', 'attr.density'],
      ['glueless', 'attr.glueless'],
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
