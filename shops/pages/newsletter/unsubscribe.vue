<script setup lang="ts">
/** P4-T09：邮件退订落地页（邮件内链接 → GET ?token= → 调后台退订） */
const route = useRoute()
const token = computed(() => String(route.query.token ?? ''))
const state = ref<'loading' | 'done' | 'error'>('loading')
const message = ref('')

onMounted(async () => {
  if (!token.value) {
    state.value = 'error'
    message.value = '退订链接无效'
    return
  }
  try {
    await $fetch(`/api/newsletter/unsubscribe?token=${encodeURIComponent(token.value)}`)
    state.value = 'done'
  } catch (err) {
    state.value = 'error'
    message.value = err instanceof Error ? err.message : '退订失败，请稍后再试'
  }
})

useSeo({ title: '退订邮件', description: '取消订阅营销邮件', path: '/newsletter/unsubscribe' })
</script>

<template>
  <div class="mx-auto max-w-md rounded-xl border border-stone-200 p-8 text-center">
    <p v-if="state === 'loading'" class="text-sm text-stone-500">处理中…</p>
    <p v-else-if="state === 'done'" class="text-sm font-medium text-emerald-700">✓ 已退订。你不会再收到营销邮件。</p>
    <p v-else class="text-sm text-red-600">{{ message }}</p>
    <NuxtLink to="/" class="mt-4 inline-block text-xs text-stone-500 underline hover:text-stone-900">返回首页</NuxtLink>
  </div>
</template>
