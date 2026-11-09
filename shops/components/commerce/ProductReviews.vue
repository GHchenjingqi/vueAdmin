<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from '~/composables/useI18n'

/**
 * 商品评价区（P4-T07 前端）：仅展示 approved（服务端过滤）；提交进 pending 审核队列。文案接入 i18n（P5-T01）。
 */
const { t, ti } = useI18n()
const props = defineProps<{ spuId: number }>()

interface ReviewItem {
  id: number
  rating: number
  title: string | null
  content: string
  customerNickname: string | null
  createdAt: string
  helpfulCount: number
  isVerified?: boolean
}

const list = ref<ReviewItem[]>([])
const summary = ref<{ average: number; count: number } | null>(null)
const loading = ref(true)

// 提交表单
const rating = ref(5)
const content = ref('')
const busy = ref(false)
const notice = ref('')

onMounted(async () => {
  try {
    const res = await $fetch<{ code: number; data: { items: ReviewItem[]; summary?: { average: number; count: number } } }>(`/api/reviews?spuId=${props.spuId}`)
    list.value = res.data.items ?? []
    summary.value = res.data.summary ?? null
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
})

async function submit(): Promise<void> {
  if (!content.value.trim()) {
    notice.value = t('reviews.required')
    return
  }
  busy.value = true
  notice.value = ''
  try {
    await $fetch('/api/reviews', {
      method: 'POST',
      body: { spuId: props.spuId, rating: rating.value, content: content.value.trim() },
    })
    notice.value = t('reviews.submitted')
    content.value = ''
  } catch (err) {
    notice.value = err instanceof Error ? err.message : t('reviews.failedSubmit')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mt-10 border-t border-stone-200 pt-8">
    <h2 class="text-lg font-semibold">
      {{ t('reviews.title') }}
      <span v-if="summary" class="ml-2 text-sm font-normal text-stone-500">{{ ti('reviews.avg', { avg: summary.average.toFixed(1), count: String(summary.count) }) }}</span>
    </h2>

    <div v-if="loading" class="mt-4 text-sm text-stone-500">{{ t('reviews.loading') }}</div>
    <p v-else-if="list.length === 0" class="mt-4 text-sm text-stone-500">{{ t('reviews.empty') }}</p>
    <ul v-else class="mt-4 space-y-4">
      <li v-for="r in list" :key="r.id" class="rounded-xl border border-stone-200 p-4">
        <div class="flex items-center gap-2 text-sm">
          <span class="text-amber-500" aria-hidden="true">{{ '★'.repeat(r.rating) }}{{ '☆'.repeat(5 - r.rating) }}</span>
          <span class="font-medium">{{ r.customerNickname || t('reviews.anonymous') }}</span>
          <span v-if="r.isVerified" class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{{ t('reviews.verified') }}</span>
          <span class="text-xs text-stone-400">{{ new Date(r.createdAt).toLocaleDateString() }}</span>
        </div>
        <p v-if="r.title" class="mt-1 text-sm font-medium">{{ r.title }}</p>
        <p class="mt-1 text-sm text-stone-600">{{ r.content }}</p>
      </li>
    </ul>

    <form class="mt-6 space-y-2 rounded-xl bg-stone-50 p-4" @submit.prevent="submit">
      <h3 class="text-sm font-semibold">{{ t('reviews.write') }}</h3>
      <div class="flex items-center gap-2 text-sm">
        <span class="text-stone-500">{{ t('reviews.rating') }}</span>
        <select v-model.number="rating" class="rounded-lg border border-stone-300 px-2 py-1.5 text-sm" :aria-label="t('reviews.rating')">
          <option v-for="n in 5" :key="n" :value="6 - n">{{ ti('reviews.stars', { n: String(6 - n) }) }}</option>
        </select>
      </div>
      <textarea v-model="content" rows="3" class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" :placeholder="t('reviews.share')" />
      <p v-if="notice" class="text-xs text-stone-600">{{ notice }}</p>
      <button type="submit" class="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50" :disabled="busy">
        {{ busy ? t('reviews.submitting') : t('reviews.submit') }}
      </button>
    </form>
  </section>
</template>
