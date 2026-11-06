<script setup lang="ts">
import { useLocale } from '~/composables/useLocale'

/**
 * 语言切换（P5-T01）：en-US / zh-CN。
 * 切换仅改变 URL 前缀（经 app/router.options.ts 匹配）与 store_locale cookie；
 * 购物车按 guest/token 服务端存储，不因切换丢失（P3-T01）。
 * 真实语言版本由 shared/i18n/messages.ts locales 定义，切换器只渲染真实版本。
 */
const { locale, localePath } = useLocale()
const route = useRoute()
const options = [
  { code: 'en-US', label: 'EN' },
  { code: 'zh-CN', label: '中文' },
] as const
</script>

<template>
  <nav class="flex items-center gap-1 text-xs" aria-label="Language">
    <NuxtLink
      v-for="opt in options"
      :key="opt.code"
      :to="localePath(route.fullPath, opt.code)"
      class="rounded px-2 py-1 hover:bg-stone-100"
      :class="locale === opt.code ? 'bg-stone-900 text-white hover:bg-stone-900' : 'text-stone-500 hover:text-stone-900'"
      :aria-current="locale === opt.code ? 'true' : undefined"
    >
      {{ opt.label }}
    </NuxtLink>
  </nav>
</template>
