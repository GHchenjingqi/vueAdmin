<script setup lang="ts">
import { MOCK_BLOG_POSTS } from '@shared/mock/fixtures'

/** 博客详情（P5-T06 前端版）：唯一 slug + BlogPosting 结构化数据。 */
const route = useRoute()
const post = computed(() => MOCK_BLOG_POSTS.find((p) => p.slug === route.params.slug) ?? null)
if (!post.value) throw createError({ statusCode: 404, statusText: 'Post not found', fatal: true })

const siteUrl = useRuntimeConfig().public.siteUrl as string
const canonicalUrl = `${siteUrl}/blog/${post.value.slug}`

useSeo({ title: post.value.title, description: post.value.excerpt, path: `/blog/${post.value.slug}` })

// schema.org/BlogPosting：与服务端 GET /cms/articles/:slug 的 structuredData 契约一致。
// 转义 '<' 防止内容里的标签提前闭合 script（XSS 纵深）。
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: post.value.title,
  description: post.value.excerpt,
  datePublished: post.value.date,
  url: canonicalUrl,
  mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
}).replace(/</g, '\\u003c')

useHead({ script: [{ type: 'application/ld+json', innerHTML: jsonLd }] })
</script>

<template>
  <article class="mx-auto max-w-2xl">
    <p class="text-xs text-stone-400">{{ post?.date }}</p>
    <h1 class="mb-6 text-2xl font-semibold">{{ post?.title }}</h1>
    <div class="text-sm leading-relaxed text-stone-700">{{ post?.body }}</div>
  </article>
</template>
