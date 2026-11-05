<script setup lang="ts">
import { MOCK_BLOG_POSTS } from '@shared/mock/fixtures'

/** 博客详情（P5-T06 前端版）：唯一 slug + 结构化数据（Article）预留。 */
const route = useRoute()
const post = computed(() => MOCK_BLOG_POSTS.find((p) => p.slug === route.params.slug) ?? null)
if (!post.value) throw createError({ statusCode: 404, statusText: 'Post not found', fatal: true })

useSeo({ title: post.value.title, description: post.value.excerpt, path: `/blog/${post.value.slug}` })
</script>

<template>
  <article class="mx-auto max-w-2xl">
    <p class="text-xs text-stone-400">{{ post?.date }}</p>
    <h1 class="mb-6 text-2xl font-semibold">{{ post?.title }}</h1>
    <div class="text-sm leading-relaxed text-stone-700">{{ post?.body }}</div>
  </article>
</template>
