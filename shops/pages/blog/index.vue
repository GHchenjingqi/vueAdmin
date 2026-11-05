<script setup lang="ts">
import { MOCK_BLOG_POSTS } from '@shared/mock/fixtures'

/** 博客列表（P5-T06 前端版）：结构预留，内容源为 mock；后端阶段切换 CMS。 */
const posts = MOCK_BLOG_POSTS
useSeo({ title: 'Blog — Aurora Hair Studio', description: 'Wig care, styling guides and brand stories.', path: '/blog' })
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-semibold">Blog</h1>
    <div class="grid gap-4 sm:grid-cols-2">
      <NuxtLink v-for="post in posts" :key="post.slug" :to="`/blog/${post.slug}`" class="rounded-xl border border-stone-200 p-6 hover:border-stone-400">
        <p class="text-xs text-stone-400">{{ post.date }}</p>
        <h2 class="mt-1 text-base font-semibold">{{ post.title }}</h2>
        <p class="mt-2 text-sm text-stone-600">{{ post.excerpt }}</p>
      </NuxtLink>
    </div>
  </div>
</template>
