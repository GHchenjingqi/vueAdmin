<script setup lang="ts">
/** 博客详情（P5-T06）：唯一 slug + BlogPosting 结构化数据。数据源 /api/cms/articles/:slug（SSR 取数）。 */
const route = useRoute()
const siteUrl = useRuntimeConfig().public.siteUrl as string
const { getArticle } = useCms()

const { data: post } = await useAsyncData(`blog-post-${route.params.slug}`, () => getArticle(String(route.params.slug)))

// 不存在 / 未发布 → 404（SSR 直接返回 404，客户端重定向错误页）
if (!post.value) throw createError({ statusCode: 404, statusText: 'Post not found', fatal: true })

// useSeo 接受普通对象：用 reactive 使标题/描述随数据更新（SSR 时已就绪）
const seo = reactive({ title: post.value.title, description: post.value.summary ?? '', path: `/blog/${route.params.slug}` })
useSeo(seo)

// schema.org/BlogPosting：优先服务端 structuredData（与 GET /cms/articles/:slug 契约一致），
// 缺失时按同契约本地构建；转义 '<' 防止内容里的标签提前闭合 script（XSS 纵深）。
const jsonLd = computed(() => {
  const canonicalUrl = `${siteUrl}/blog/${post.value!.slug}`
  const ld =
    post.value!.structuredData && Object.keys(post.value!.structuredData).length > 0
      ? post.value!.structuredData
      : {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.value!.title,
          description: post.value!.summary,
          datePublished: post.value!.publishedAt,
          url: canonicalUrl,
          mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
        }
  return JSON.stringify(ld).replace(/</g, '\\u003c')
})
useHead({ script: [{ type: 'application/ld+json', innerHTML: jsonLd }] })
</script>

<template>
  <article class="mx-auto max-w-2xl">
    <p class="text-xs text-stone-400">{{ post?.publishedAt }}</p>
    <h1 class="mb-6 text-2xl font-semibold">{{ post?.title }}</h1>
    <div class="text-sm leading-relaxed text-stone-700">{{ post?.content }}</div>
  </article>
</template>
