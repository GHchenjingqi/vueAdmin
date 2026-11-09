<script setup lang="ts">
/** 博客列表（P5-T06）：数据源 /api/cms/articles（BFF → 真实后台或 mock 兜底）。文案接入 i18n（P5-T01）。 */
import type { CmsArticleSummary } from '~/composables/useCms'
import { useI18n } from '~/composables/useI18n'
const { t, ti } = useI18n()
const { loading, error, listArticles } = useCms()
const posts = ref<CmsArticleSummary[]>([])
const total = ref(0)

onMounted(async () => {
  const res = await listArticles({ page: 1, pageSize: 20 })
  posts.value = res.items
  total.value = res.total
})

useSeo({
  title: () => t('blog.title'),
  description: () => 'Wig care guides, glueless wig installation tutorials and hair tips from Aurora Hair Studio.',
  keywords: () => 'wig care, glueless wig install, human hair wig tips, wig blog, hair care guide',
  path: '/blog',
})
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-semibold">{{ t('blog.title') }}</h1>
    <p v-if="loading" class="text-sm text-stone-400">{{ t('blog.loading') }}</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>
    <p v-else-if="posts.length === 0" class="text-sm text-stone-400">{{ t('blog.empty') }}</p>
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <NuxtLink v-for="post in posts" :key="post.slug" :to="`/blog/${post.slug}`" class="rounded-xl border border-stone-200 p-6 hover:border-stone-400">
        <p class="text-xs text-stone-400">{{ post.publishedAt ?? post.summary }}</p>
        <h2 class="mt-1 text-base font-semibold">{{ post.title }}</h2>
        <p class="mt-2 text-sm text-stone-600">{{ post.summary }}</p>
      </NuxtLink>
    </div>
    <p v-if="total > posts.length" class="mt-6 text-xs text-stone-400">{{ ti('blog.showing', { shown: String(posts.length), total: String(total) }) }}</p>
  </div>
</template>
