<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from '~/composables/useI18n'

/**
 * 售前问答区（B 块）：仅展示 answered（服务端过滤）；游客/登录可提问（进 pending 队列）。
 * 后端复用 storefront /qa 公开接口（GET 列表 / POST 提问），零新后端。
 */
const { t, ti } = useI18n()
const props = defineProps<{ spuId: number }>()

interface QAItem {
  id: number
  question: string
  answer: string
  answeredAt: string | null
}

const list = ref<QAItem[]>([])
const loading = ref(true)

const question = ref('')
const busy = ref(false)
const notice = ref('')
const expanded = ref(false)

onMounted(async () => {
  try {
    const res = await $fetch<{ code: number; data: QAItem[] }>(`/api/qa?spuId=${props.spuId}`)
    list.value = res.data ?? []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
})

async function submit(): Promise<void> {
  const q = question.value.trim()
  if (!q) {
    notice.value = t('productQa.required')
    return
  }
  busy.value = true
  notice.value = ''
  try {
    await $fetch('/api/qa', {
      method: 'POST',
      body: { spuId: props.spuId, question: q },
    })
    notice.value = t('productQa.submitted')
    question.value = ''
  } catch (err) {
    notice.value = err instanceof Error ? err.message : t('productQa.failedSubmit')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mt-10 border-t border-stone-200 pt-8">
    <h2 class="text-lg font-semibold">
      {{ t('productQa.title') }}
      <span v-if="list.length" class="ml-2 text-sm font-normal text-stone-500">({{ list.length }})</span>
    </h2>

    <div v-if="loading" class="mt-4 text-sm text-stone-500">{{ t('productQa.loading') }}</div>
    <template v-else>
      <p v-if="list.length === 0" class="mt-4 text-sm text-stone-500">{{ t('productQa.empty') }}</p>
      <ul v-else class="mt-4 space-y-4">
        <li v-for="item in (expanded ? list : list.slice(0, 3))" :key="item.id" class="rounded-xl border border-stone-200 p-4">
          <p class="text-sm font-medium text-stone-900">
            <span class="mr-1 text-stone-400" aria-hidden="true">Q</span>{{ item.question }}
          </p>
          <p class="mt-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
            <span class="mr-1 font-semibold text-stone-500" aria-hidden="true">A</span>{{ item.answer }}
          </p>
          <p v-if="item.answeredAt" class="mt-1 text-xs text-stone-400">{{ new Date(item.answeredAt).toLocaleDateString() }}</p>
        </li>
      </ul>
      <button
        v-if="list.length > 3"
        type="button"
        class="mt-3 text-sm font-medium text-stone-600 underline hover:text-stone-900"
        @click="expanded = !expanded"
      >
        {{ expanded ? t('productQa.collapse') : ti('productQa.expand', { n: String(list.length - 3) }) }}
      </button>
    </template>

    <form class="mt-6 space-y-2 rounded-xl bg-stone-50 p-4" @submit.prevent="submit">
      <h3 class="text-sm font-semibold">{{ t('productQa.ask') }}</h3>
      <textarea
        v-model="question"
        rows="3"
        class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        :placeholder="t('productQa.placeholder')"
      />
      <p v-if="notice" class="text-xs text-stone-600">{{ notice }}</p>
      <button
        type="submit"
        class="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
        :disabled="busy"
      >
        {{ busy ? t('productQa.submitting') : t('productQa.submit') }}
      </button>
      <p class="text-xs text-stone-400">{{ t('productQa.pendingHint') }}</p>
    </form>
  </section>
</template>
