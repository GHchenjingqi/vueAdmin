<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
/** 基础 UI 组件（P1-T12）：Dialog（open 关闭由父组件控制，Escape 可关） */
const { t } = useI18n()
const props = defineProps<{ open: boolean; title?: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.open) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" :aria-label="title">
      <div class="absolute inset-0 bg-stone-900/40" @click="emit('close')" />
      <div class="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-base font-semibold">{{ title }}</h3>
          <button type="button" class="text-stone-400 hover:text-stone-900" :aria-label="t('common.close')" @click="emit('close')">✕</button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
