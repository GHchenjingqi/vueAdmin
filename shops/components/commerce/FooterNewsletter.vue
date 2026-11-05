<script setup lang="ts">
import { ref } from 'vue'

/**
 * P4-T09：页脚邮件订阅（双重确认=显式勾选同意 + 双重确认邮件由后台 mailer 承接）。
 * 成功态展示退订说明；失败态展示服务端错误（邮箱非法/重复等）。
 */
const email = ref('')
const consent = ref(false)
const state = ref<'idle' | 'loading' | 'done' | 'error'>('idle')
const errorMsg = ref('')

async function subscribe(): Promise<void> {
  if (!consent.value) {
    errorMsg.value = '请先勾选同意接收邮件'
    return
  }
  state.value = 'loading'
  errorMsg.value = ''
  try {
    await $fetch('/api/newsletter/subscribe', { method: 'POST', body: { email: email.value, source: 'footer' } })
    state.value = 'done'
  } catch (err) {
    state.value = 'error'
    errorMsg.value = err instanceof Error ? err.message : '订阅失败，请稍后再试'
  }
}
</script>

<template>
  <div class="rounded-xl border border-stone-200 bg-stone-50 p-5">
    <template v-if="state === 'done'">
      <p class="text-sm font-medium text-emerald-700">✓ 订阅成功！确认邮件已发送至 {{ email }}，邮件内可随时退订。</p>
    </template>
    <template v-else>
      <h3 class="text-sm font-semibold text-stone-900">订阅新品与护理指南</h3>
      <form class="mt-3 space-y-2" @submit.prevent="subscribe">
        <div class="flex gap-2">
          <input
            v-model="email"
            type="email"
            required
            placeholder="your@email.com"
            class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none"
            aria-label="邮箱地址"
          />
          <button
            type="submit"
            class="shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
            :disabled="state === 'loading'"
          >
            {{ state === 'loading' ? '订阅中…' : '订阅' }}
          </button>
        </div>
        <label class="flex items-start gap-2 text-xs text-stone-500">
          <input v-model="consent" type="checkbox" class="mt-0.5" />
          <span>我同意接收营销邮件，并已阅读<a href="/policies/privacy" class="underline hover:text-stone-800">隐私政策</a>。可随时通过邮件链接退订。</span>
        </label>
        <p v-if="errorMsg" class="text-xs text-red-600">{{ errorMsg }}</p>
      </form>
    </template>
  </div>
</template>
