<script setup lang="ts">
/**
 * FAQ 页（C-FAQ）：数据源 /api/cms/faqs（BFF → 真实后台 /storefront/v1/cms/faqs 或 mock 兜底）。
 * 复用 shop_articles 表（tags 含 'faq'），零新表。手风琴交互 + 分类切换 + 关键词过滤（客户端）。
 * SSG 首屏由 useAsyncData 预取（SEO 可索引），后续分类/搜索在已加载列表上过滤（零额外请求）。
 */
import { useI18n } from '~/composables/useI18n'

const { t } = useI18n()

interface FaqItem {
  id: number
  question: string
  answer: string
  shortAnswer: string | null
  category: string | null
  slug: string
  sortOrder: number
  updatedAt: string
}

interface FaqListResult {
  items: FaqItem[]
  categories: string[]
}

const { data, error } = await useAsyncData<FaqListResult>('faq-list', () =>
  $fetch<FaqListResult>('/api/cms/faqs'),
)

const allItems = computed(() => data.value?.items ?? [])
const categories = computed(() => data.value?.categories ?? [])
const activeCategory = ref<string>('')
const keyword = ref<string>('')
const openIds = ref<Set<number>>(new Set())

const filtered = computed<FaqItem[]>(() => {
  let list = allItems.value
  if (activeCategory.value) list = list.filter((i) => i.category === activeCategory.value)
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(
      (i) => i.question.toLowerCase().includes(kw) || i.shortAnswer?.toLowerCase().includes(kw),
    )
  }
  return list
})

function toggle(id: number): void {
  const next = new Set(openIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  openIds.value = next
}

function isOpen(id: number): boolean {
  return openIds.value.has(id)
}

function switchCategory(cat: string): void {
  activeCategory.value = cat
}

const description = computed(() =>
  (allItems.value[0]?.shortAnswer || t('faq.description')).slice(0, 155),
)

useSeo({
  title: () => t('faq.title'),
  description: () => description.value,
  keywords: () => 'FAQ, shipping time, return policy, wig sizing, hair type',
  path: '/faq',
  ogType: 'website',
})
</script>

<template>
  <article class="mx-auto max-w-3xl">
    <h1 class="mb-2 text-2xl font-semibold">{{ t('faq.title') }}</h1>
    <p class="mb-6 text-sm text-stone-500">{{ t('faq.description') }}</p>

    <p v-if="error" class="text-sm text-red-600">{{ error.message }}</p>
    <p v-else-if="!data" class="text-sm text-stone-400">{{ t('faq.loading') }}</p>
    <template v-else>
      <!-- 分类切换 + 关键词过滤 -->
      <div class="mb-6 space-y-3">
        <div class="flex flex-wrap gap-2" role="tablist" aria-label="FAQ categories">
          <button
            type="button"
            class="rounded-full border px-3 py-1 text-sm transition"
            :class="activeCategory === '' ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 text-stone-600 hover:border-stone-500'"
            :aria-pressed="activeCategory === ''"
            @click="switchCategory('')"
          >
            {{ t('faq.allCategories') }}
          </button>
          <button
            v-for="cat in categories"
            :key="cat"
            type="button"
            class="rounded-full border px-3 py-1 text-sm transition"
            :class="activeCategory === cat ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 text-stone-600 hover:border-stone-500'"
            :aria-pressed="activeCategory === cat"
            @click="switchCategory(cat)"
          >
            {{ cat }}
          </button>
        </div>
        <input
          v-model="keyword"
          type="search"
          class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          :placeholder="t('faq.searchPlaceholder')"
          aria-label="Search FAQ"
        />
      </div>

      <p v-if="filtered.length === 0" class="text-sm text-stone-400">
        {{ allItems.length === 0 ? t('faq.empty') : t('faq.searchEmpty') }}
      </p>

      <dl v-else class="divide-y divide-stone-200">
        <div v-for="item in filtered" :key="item.id" class="py-4">
          <dt>
            <button
              type="button"
              class="flex w-full items-center justify-between gap-4 text-left"
              :aria-expanded="isOpen(item.id)"
              :aria-controls="`faq-answer-${item.id}`"
              @click="toggle(item.id)"
            >
              <span class="text-base font-medium text-stone-900">{{ item.question }}</span>
              <span class="text-stone-400" aria-hidden="true">{{ isOpen(item.id) ? '−' : '+' }}</span>
            </button>
            <p v-if="item.category" class="mt-1 text-xs text-stone-400">{{ item.category }}</p>
          </dt>
          <dd
            v-show="isOpen(item.id)"
            :id="`faq-answer-${item.id}`"
            class="prose prose-stone prose-sm mt-3 max-w-none text-stone-700"
            v-html="item.answer"
          />
        </div>
      </dl>
    </template>
  </article>
</template>
