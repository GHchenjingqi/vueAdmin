<script setup lang="ts">
const props = withDefaults(defineProps<{ tone?: 'in-stock' | 'low' | 'out'; label?: string }>(), { tone: 'in-stock', label: undefined })
const toneClass = computed(() => {
  switch (props.tone) {
    case 'low':
      return 'bg-amber-100 text-amber-800'
    case 'out':
      return 'bg-stone-200 text-stone-500'
    default:
      return 'bg-emerald-100 text-emerald-800'
  }
})
const fallback = computed(() => (props.tone === 'out' ? 'Out of stock' : props.tone === 'low' ? 'Low stock' : 'In stock'))
</script>

<template>
  <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" :class="toneClass">
    <slot>{{ label ?? fallback }}</slot>
  </span>
</template>
