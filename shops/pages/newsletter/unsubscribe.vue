<script setup lang="ts">
/** P4-T09：邮件退订落地页（邮件内链接 → GET ?token= → 调后台退订）。文案接入 i18n（P5-T01）。 */
import { useI18n } from '~/composables/useI18n'
const { t } = useI18n()
const route = useRoute()
const token = computed(() => String(route.query.token ?? ''))
const state = ref<'loading' | 'done' | 'error'>('loading')
const message = ref('')

onMounted(async () => {
  if (!token.value) {
    state.value = 'error'
    message.value = t('unsubscribe.invalid')
    return
  }
  try {
    await $fetch(`/api/newsletter/unsubscribe?token=${encodeURIComponent(token.value)}`)
    state.value = 'done'
  } catch (err) {
    state.value = 'error'
    message.value = err instanceof Error ? err.message : t('unsubscribe.failed')
  }
})

useSeo({ title: () => t('unsubscribe.title'), description: () => t('unsubscribe.subtitle'), path: '/newsletter/unsubscribe', noindex: true })
</script>

<template>
  <div class="mx-auto max-w-md rounded-xl border border-stone-200 p-8 text-center">
    <p v-if="state === 'loading'" class="text-sm text-stone-500">{{ t('unsubscribe.processing') }}</p>
    <p v-else-if="state === 'done'" class="text-sm font-medium text-emerald-700">{{ t('unsubscribe.done') }}</p>
    <p v-else class="text-sm text-red-600">{{ message }}</p>
    <NuxtLink to="/" class="mt-4 inline-block text-xs text-stone-500 underline hover:text-stone-900">{{ t('unsubscribe.home') }}</NuxtLink>
  </div>
</template>
