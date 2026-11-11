<script setup lang="ts">
import ProductCard from '~/components/commerce/ProductCard.vue'
import { useI18n } from '~/composables/useI18n'
import { listBanners, type CmsBanner } from '~/composables/useCms'

const { t } = useI18n()
const catalog = useCatalog()
const siteUrl = useRuntimeConfig().public.siteUrl as string
const { data: categories } = await useAsyncData('home-categories', () => catalog.loadCategories())
const { data: featured } = await useAsyncData('home-featured', () => catalog.listProducts({ pageSize: 8 }))

// 首页 Banner 轮播（营销首屏）：无 banner 时回退静态 hero
const { data: banners } = await useAsyncData('home-banners', () => listBanners('hero'))
const bannerList = computed<CmsBanner[]>(() => banners.value ?? [])
const activeBanner = ref(0)
const hasBanners = computed(() => bannerList.value.length > 0)

// 次屏营销 Banner（活动 / 促销入口）：后台可配 position='secondary'
const { data: secondaryBanners } = await useAsyncData('home-secondary-banners', () => listBanners('secondary'))
const secondaryList = computed<CmsBanner[]>(() => secondaryBanners.value ?? [])

let bannerTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  if (bannerList.value.length > 1) {
    bannerTimer = setInterval(() => {
      activeBanner.value = (activeBanner.value + 1) % bannerList.value.length
    }, 6000)
  }
})
onBeforeUnmount(() => {
  if (bannerTimer) clearInterval(bannerTimer)
})

// 博客精选（取已发布文章 3 篇）
const { data: blogPosts } = await useAsyncData('home-blog', () =>
  useCms().listArticles({ page: 1, pageSize: 3 }).then((r) => r.items),
)

// 邮件订阅
const email = ref('')
const subscribing = ref(false)
const subscribed = ref(false)
const subscribe = async () => {
  if (!email.value.trim() || subscribing.value) return
  subscribing.value = true
  try {
    await $fetch('/api/newsletter/subscribe', { method: 'POST', body: { email: email.value, source: 'home' } })
    subscribed.value = true
    email.value = ''
  } catch {
    // 静默失败，避免打断浏览
  } finally {
    subscribing.value = false
  }
}

const trustItems = computed(() => [
  { icon: '🔒', title: t('home.trustSecure'), desc: t('home.trustSecureDesc') },
  { icon: '🚚', title: t('home.trustShipping'), desc: t('home.trustShippingDesc') },
  { icon: '↩️', title: t('home.trustReturns'), desc: t('home.trustReturnsDesc') },
  { icon: '⭐', title: t('home.trustReviews'), desc: t('home.trustReviewsDesc') },
])

useSeo({
  title: () => t('home.heroTitle'),
  description: () => `${t('home.heroSubtitle')} Shop HD lace wigs, body wave & deep wave human hair wigs, plus apparel. Free standard shipping over $99, 30-day returns.`,
  keywords: () =>
    'HD lace wigs, glueless wigs, human hair wigs, lace front wigs, body wave wig, deep wave wig, pre-plucked lace wig, natural hairline wig, hair studio',
  ogType: 'website',
  ogImage: () => featured.value?.list?.[0]?.cover ?? '',
  path: '/',
})

// 跨境独立站首页结构化数据：Organization + WebSite（含站内搜索）。
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Aurora Hair Studio', url: siteUrl }),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Aurora Hair Studio',
        url: siteUrl,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${siteUrl}/search?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      }),
    },
  ],
})
</script>

<template>
  <div class="space-y-10">
    <!-- Banner 轮播 / 静态 hero -->
    <section v-if="hasBanners" class="relative overflow-hidden rounded-2xl bg-stone-900">
      <div class="relative h-[320px] sm:h-[400px]">
        <img
          v-for="(b, idx) in bannerList"
          :key="b.id"
          :src="b.image"
          :alt="b.title"
          class="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
          :class="idx === activeBanner ? 'opacity-100' : 'opacity-0'"
        />
        <div class="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />
        <div class="absolute inset-0 flex flex-col justify-center px-6 sm:px-12">
          <template v-for="(b, idx) in bannerList" :key="b.id">
            <div v-if="idx === activeBanner" class="max-w-xl text-white">
              <h2 class="text-2xl font-semibold tracking-tight sm:text-4xl">{{ b.title }}</h2>
              <p v-if="b.subtitle" class="mt-3 text-sm text-stone-200">{{ b.subtitle }}</p>
              <NuxtLink
                v-if="b.linkUrl"
                :to="b.linkUrl"
                class="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-stone-900 hover:bg-stone-100"
              >
                {{ b.buttonLabel || t('home.shopLaceWigs') }}
              </NuxtLink>
            </div>
          </template>
        </div>
        <!-- 轮播指示器 -->
        <div v-if="bannerList.length > 1" class="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
          <button
            v-for="(b, idx) in bannerList"
            :key="b.id"
            class="h-2 rounded-full transition-all"
            :class="idx === activeBanner ? 'w-6 bg-white' : 'w-2 bg-white/50'"
            @click="activeBanner = idx"
          />
        </div>
      </div>
    </section>
    <section v-else class="rounded-2xl bg-stone-900 px-6 py-14 text-center text-white">
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{{ t('home.heroTitle') }}</h1>
      <p class="mx-auto mt-3 max-w-xl text-sm text-stone-300">{{ t('home.heroSubtitle') }}</p>
      <NuxtLink to="/c/lace-wigs" class="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-stone-900 hover:bg-stone-100">
        {{ t('home.shopLaceWigs') }}
      </NuxtLink>
    </section>

    <!-- 次屏营销 Banner（活动 / 促销入口） -->
    <section v-if="secondaryList.length" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="b in secondaryList"
        :key="b.id"
        :to="b.linkUrl || '#'"
        class="group relative overflow-hidden rounded-2xl bg-stone-100"
      >
        <img :src="b.image" :alt="b.title" class="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div class="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/55 to-transparent p-4">
          <h3 class="text-base font-semibold text-white">{{ b.title }}</h3>
          <p v-if="b.subtitle" class="mt-1 text-xs text-stone-200">{{ b.subtitle }}</p>
          <span v-if="b.buttonLabel" class="mt-2 w-fit rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-stone-900">
            {{ b.buttonLabel }}
          </span>
        </div>
      </NuxtLink>
    </section>

    <!-- 信任条 -->
    <section class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div v-for="item in trustItems" :key="item.title" class="rounded-xl border border-stone-200 px-4 py-5 text-center">
        <div class="text-2xl">{{ item.icon }}</div>
        <div class="mt-2 text-sm font-semibold">{{ item.title }}</div>
        <div class="mt-1 text-xs text-stone-600">{{ item.desc }}</div>
      </div>
    </section>

    <!-- 分类入口 -->
    <section>
      <h2 class="mb-4 text-lg font-semibold">{{ t('home.shopByCategory') }}</h2>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <NuxtLink
          v-for="cat in categories ?? []"
          :key="cat.id"
          :to="`/c/${cat.slug}`"
          class="rounded-xl border border-stone-200 px-4 py-6 text-center hover:border-stone-400"
        >
          <span class="text-sm font-medium">{{ cat.name }}</span>
        </NuxtLink>
      </div>
    </section>

    <!-- 畅销榜 -->
    <section>
      <h2 class="mb-4 text-lg font-semibold">{{ t('home.bestSellers') }}</h2>
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <ProductCard v-for="p in featured?.list ?? []" :key="p.id" :product="p" />
      </div>
    </section>

    <!-- 博客精选 -->
    <section v-if="blogPosts?.length">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-lg font-semibold">{{ t('home.blogTitle') }}</h2>
        <NuxtLink to="/blog" class="text-sm text-stone-600 hover:text-stone-900">{{ t('home.blogMore') }}</NuxtLink>
      </div>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NuxtLink
          v-for="post in blogPosts"
          :key="post.id"
          :to="`/blog/${post.slug}`"
          class="group overflow-hidden rounded-xl border border-stone-200 hover:border-stone-400"
        >
          <img v-if="post.coverImage" :src="post.coverImage" :alt="post.title" class="h-48 w-full object-cover" />
          <div class="px-4 py-4">
            <h3 class="line-clamp-2 text-sm font-semibold group-hover:text-stone-700">{{ post.title }}</h3>
            <p v-if="post.summary" class="mt-2 line-clamp-2 text-xs text-stone-600">{{ post.summary }}</p>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- 邮件订阅 -->
    <section class="rounded-2xl bg-stone-100 px-6 py-12 text-center">
      <h2 class="text-xl font-semibold">{{ t('home.newsletterTitle') }}</h2>
      <p class="mx-auto mt-2 max-w-md text-sm text-stone-600">{{ t('home.newsletterSubtitle') }}</p>
      <div v-if="subscribed" class="mx-auto mt-6 max-w-md text-sm font-medium text-green-700">
        ✓ 已订阅，欢迎加入！
      </div>
      <form v-else class="mx-auto mt-6 flex max-w-md gap-2" @submit.prevent="subscribe">
        <input
          v-model="email"
          type="email"
          :placeholder="t('home.newsletterPlaceholder')"
          class="flex-1 rounded-lg border border-stone-300 px-4 py-3 text-sm focus:border-stone-900 focus:outline-none"
        />
        <button
          type="submit"
          :disabled="subscribing"
          class="rounded-lg bg-stone-900 px-6 py-3 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {{ subscribing ? '...' : t('home.newsletterButton') }}
        </button>
      </form>
    </section>
  </div>
</template>
