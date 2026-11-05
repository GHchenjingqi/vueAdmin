<script setup lang="ts">
import { ref } from 'vue'
import { readConsent, grantConsent } from '@shared/analytics/consent'
import { loadGa4 } from '@shared/analytics/events'

/**
 * P4-T11：Cookie 同意横幅（首次访问显示；决定后不再出现；可随时撤回）。
 * 拒绝 = 仅必要 Cookie；接受 = analytics + marketing。
 */
const visible = ref(false)
const cfg = useStoreConfig()

onMounted(() => {
  visible.value = readConsent() === null
})

function decide(analytics: boolean): void {
  grantConsent({ analytics, marketing: analytics })
  if (analytics) {
    const id = useRuntimeConfig().public.ga4MeasurementId as string | undefined
    if (id) loadGa4(id)
  }
  visible.value = false
}
</script>

<template>
  <div
    v-if="visible"
    class="fixed bottom-3 left-3 right-3 z-50 mx-auto max-w-xl rounded-xl border border-stone-200 bg-white p-4 shadow-lg"
    role="dialog"
    aria-label="Cookie 使用偏好"
  >
    <p class="text-xs leading-relaxed text-stone-600">
      我们使用必要 Cookie 保障站点运行，并希望在{{ cfg.market.value.language === 'zh-CN' ? '你' : '您' }}同意后使用统计与营销 Cookie 优化体验。详见
      <NuxtLink to="/policies/privacy" class="underline hover:text-stone-800">隐私政策</NuxtLink>。
    </p>
    <div class="mt-3 flex gap-2">
      <button type="button" class="flex-1 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700" @click="decide(true)">
        全部接受
      </button>
      <button type="button" class="flex-1 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:border-stone-500" @click="decide(false)">
        仅必要
      </button>
    </div>
  </div>
</template>
