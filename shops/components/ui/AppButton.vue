<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    disabled?: boolean
    loading?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', disabled: false, loading: false, type: 'button' },
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
    :class="{
      'bg-stone-900 text-white hover:bg-stone-700 disabled:hover:bg-stone-900': variant === 'primary',
      'border border-stone-300 bg-white text-stone-800 hover:border-stone-400': variant === 'secondary',
      'bg-transparent text-stone-600 hover:text-stone-900': variant === 'ghost',
    }"
  >
    <span v-if="loading" class="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
    <slot />
  </button>
</template>
