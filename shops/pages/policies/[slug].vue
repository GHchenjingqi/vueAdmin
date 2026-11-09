<script setup lang="ts">
import { MOCK_POLICY_PAGES } from '@shared/mock/fixtures'
import { useI18n } from '~/composables/useI18n'

/** 政策页（P4-T12 前端版）：内容与市场一致、版本与生效日期可见；文中货币表述取配置（Price 表述由文案约定，不写死符号）。文案接入 i18n（P5-T01）。 */
const { t } = useI18n()
const route = useRoute()
const slug = computed(() => String(route.params.slug ?? 'privacy'))
const page = computed(() => MOCK_POLICY_PAGES[slug.value] ?? null)

if (!page.value) throw createError({ statusCode: 404, statusText: 'Policy not found', fatal: true })

useSeo({
  title: page.value.title,
  description: page.value.body.slice(0, 155),
  keywords: `${page.value.title}, Aurora Hair Studio policies, shipping, returns, privacy`,
  path: `/policies/${slug.value}`,
})
</script>

<template>
  <article class="mx-auto max-w-2xl">
    <h1 class="mb-2 text-2xl font-semibold">{{ page?.title }}</h1>
    <p class="mb-6 text-xs text-stone-400">{{ t('policies.meta') }}</p>
    <div class="prose prose-stone text-sm leading-relaxed text-stone-700">
      <p>{{ page?.body }}</p>
    </div>
  </article>
</template>
