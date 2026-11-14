<script setup lang="ts">
import { MOCK_POLICY_PAGES } from '@shared/mock/fixtures'
import { useI18n } from '~/composables/useI18n'

/**
 * 政策页（P4-T12 → PLAN 5.1）
 *
 * 此前内容直接 import 自 `@shared/mock/fixtures`，后台无法维护 ——
 * 隐私政策/退货政策更新必须改代码发版。
 *
 * 现在：优先读 CMS 文章（后台「文章管理」新建 slug=privacy/terms/shipping/returns 的已发布文章），
 * 取不到才回退内置文案。这样运营可以自行更新，且旧部署不会因缺内容而 404。
 */
const { t } = useI18n()
const route = useRoute()
const slug = computed(() => String(route.params.slug ?? 'privacy'))

interface PolicyPage {
  title: string
  body: string
  /** 来源：cms=后台可维护；fallback=内置文案 */
  source: 'cms' | 'fallback'
  updatedAt?: string
}

const { data: page, error } = await useAsyncData<PolicyPage | null>(
  `policy-${slug.value}`,
  async () => {
    // 先试后台 CMS（BFF 直通 storefront/v1/cms/articles/:slug）
    try {
      const res = await $fetch<{ title?: string; content?: string; updatedAt?: string }>(
        `/api/cms/articles/${encodeURIComponent(slug.value)}`,
      )
      if (res?.content && String(res.content).trim()) {
        return {
          title: res.title || slug.value,
          body: String(res.content),
          source: 'cms' as const,
          updatedAt: res.updatedAt,
        }
      }
    } catch {
      // 后台无该文章 / 服务不可达 → 回退内置文案（政策页不能 404，属合规页面）
    }
    const fallback = MOCK_POLICY_PAGES[slug.value]
    return fallback ? { title: fallback.title, body: fallback.body, source: 'fallback' as const } : null
  },
  { watch: [slug] },
)

if (!page.value) throw createError({ statusCode: 404, statusText: 'Policy not found', fatal: true })
if (error.value && !page.value) throw createError({ statusCode: 500, statusText: 'Policy unavailable', fatal: true })

useSeo({
  title: page.value.title,
  description: page.value.body.slice(0, 155).replace(/\s+/g, ' '),
  keywords: `${page.value.title}, shipping, returns, privacy`,
  path: `/policies/${slug.value}`,
})
</script>

<template>
  <article class="mx-auto max-w-2xl">
    <h1 class="mb-2 text-2xl font-semibold">{{ page?.title }}</h1>
    <p class="mb-6 text-xs text-stone-400">
      {{ t('policies.meta') }}
      <span v-if="page?.updatedAt"> · {{ new Date(page.updatedAt).toLocaleDateString() }}</span>
    </p>
    <div class="prose prose-stone text-sm leading-relaxed text-stone-700">
      <!-- 政策正文可能含换行，按段落渲染；后台用纯文本维护，避免富文本 XSS 面 -->
      <p v-for="(para, i) in (page?.body ?? '').split(/\n{2,}/)" :key="i" class="mb-3 whitespace-pre-line">{{ para }}</p>
    </div>
  </article>
</template>
