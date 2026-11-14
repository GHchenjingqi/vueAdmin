<script setup lang="ts">
import { ref, computed } from 'vue'
import { register, login, logout, getStoredCustomer, getToken, me, type CustomerPublic, isAuthenticated } from '@shared/customer/auth'
import { useI18n } from '~/composables/useI18n'

/**
 * 账户中心（P4-T01）：注册/登录/登出/me。登录后可访问 /account/rma 退货。文案接入 i18n（P5-T01）。
 */
const { t } = useI18n()
const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const nickname = ref('')
const busy = ref(false)
const error = ref('')

const customer = ref<CustomerPublic | null>(getStoredCustomer())
const loggedIn = computed(() => !!customer.value && isAuthenticated())

onMounted(async () => {
  if (loggedIn.value) {
    try {
      customer.value = await me()
    } catch {
      // token 过期 → 本地登出
      await logout()
      customer.value = null
    }
  }
})

async function submit(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    if (mode.value === 'register') {
      await register(email.value, password.value, nickname.value || undefined)
    }
    customer.value = await login(email.value, password.value)
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('account.failed')
  } finally {
    busy.value = false
  }
}

async function doLogout(): Promise<void> {
  await logout()
  customer.value = null
}

// ==================== 数据权利（PLAN 5.3） ====================
const dataBusy = ref(false)
const deleteOpen = ref(false)
const deletePassword = ref('')
const deleteError = ref('')

/** 导出本人数据：后端返回 JSON 附件，这里转成浏览器下载，避免 JSON 直接铺满页面 */
async function exportData(): Promise<void> {
  const token = getToken()
  if (!token) return
  dataBusy.value = true
  try {
    const res = await fetch('/api/auth/me/export', { headers: { authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(t('account.exportFailed'))
    const data = await res.json()
    // 后端信封 {code,data}：导出内容取 data
    const payload = data?.data ?? data
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `my-data-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : t('account.exportFailed')
  } finally {
    dataBusy.value = false
  }
}

/** 注销：先密码校验，成功后清本地会话并回到未登录态 */
async function confirmDelete(): Promise<void> {
  const token = getToken()
  if (!token || !deletePassword.value) return
  dataBusy.value = true
  deleteError.value = ''
  try {
    const res = await fetch('/api/auth/me', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ password: deletePassword.value }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.message || t('account.deleteFailed'))
    }
    await logout()
    customer.value = null
    deleteOpen.value = false
  } catch (err) {
    deleteError.value = err instanceof Error ? err.message : t('account.deleteFailed')
  } finally {
    dataBusy.value = false
  }
}

useSeo({ title: () => t('account.title'), description: () => t('account.description'), path: '/account', noindex: true })
</script>

<template>
  <div class="mx-auto max-w-md">
    <template v-if="loggedIn">
      <div class="rounded-xl border border-stone-200 p-6">
        <p class="text-sm text-stone-500">{{ t('account.welcome') }}</p>
        <h1 class="mt-1 text-xl font-semibold">{{ customer?.nickname || customer?.email }}</h1>
        <div class="mt-5 space-y-2 text-sm">
          <NuxtLink to="/account/orders" class="block rounded-lg border border-stone-200 px-4 py-3 hover:border-stone-400">{{ t('account.title') }}</NuxtLink>
          <NuxtLink to="/account/wishlist" class="block rounded-lg border border-stone-200 px-4 py-3 hover:border-stone-400">{{ t('wishlist.title') }}</NuxtLink>
          <NuxtLink to="/account/coupons" class="block rounded-lg border border-stone-200 px-4 py-3 hover:border-stone-400">{{ t('coupons.title') }}</NuxtLink>
          <NuxtLink to="/account/addresses" class="block rounded-lg border border-stone-200 px-4 py-3 hover:border-stone-400">{{ t('account.addressBook') }}</NuxtLink>
          <NuxtLink to="/account/rma" class="block rounded-lg border border-stone-200 px-4 py-3 hover:border-stone-400">{{ t('account.rma') }}</NuxtLink>
          <NuxtLink to="/policies/returns" class="block rounded-lg border border-stone-200 px-4 py-3 hover:border-stone-400">{{ t('account.returnsPolicy') }}</NuxtLink>
        </div>
        <button type="button" class="mt-5 w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-medium hover:border-stone-500" @click="doLogout">
          {{ t('account.logout') }}
        </button>

        <!-- PLAN 5.3：数据权利入口（GDPR 可携带权 / 被遗忘权） -->
        <div class="mt-6 border-t border-stone-200 pt-4">
          <h2 class="text-sm font-semibold text-stone-900">{{ t('account.dataRights') }}</h2>
          <p class="mt-1 text-xs text-stone-500">{{ t('account.dataRightsHint') }}</p>
          <button
            type="button"
            class="mt-3 w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-medium hover:border-stone-500"
            :disabled="dataBusy"
            @click="exportData"
          >
            {{ t('account.exportData') }}
          </button>
          <button
            type="button"
            class="mt-2 w-full rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:border-red-400"
            :disabled="dataBusy"
            @click="deleteOpen = true"
          >
            {{ t('account.deleteAccount') }}
          </button>
        </div>
      </div>

      <!-- 注销二次确认：需输入密码，且明确告知订单会以匿名形式保留 -->
      <div v-if="deleteOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
        <div class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <h3 class="text-base font-semibold text-stone-900">{{ t('account.deleteTitle') }}</h3>
          <p class="mt-2 text-xs leading-relaxed text-stone-600">{{ t('account.deleteHint') }}</p>
          <input
            v-model="deletePassword"
            type="password"
            :placeholder="t('account.deletePasswordPlaceholder')"
            class="mt-3 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-900 focus:outline-none"
          />
          <p v-if="deleteError" class="mt-2 text-xs text-red-600">{{ deleteError }}</p>
          <div class="mt-4 flex gap-2">
            <button type="button" class="flex-1 rounded-lg border border-stone-300 px-4 py-2 text-sm" @click="deleteOpen = false">
              {{ t('account.cancel') }}
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              :disabled="dataBusy || !deletePassword"
              @click="confirmDelete"
            >
              {{ t('account.deleteConfirm') }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <form v-else class="space-y-3 rounded-xl border border-stone-200 p-6" @submit.prevent="submit">
      <div class="flex gap-2 text-sm">
        <button
          type="button"
          class="flex-1 rounded-lg px-3 py-2 font-medium"
          :class="mode === 'login' ? 'bg-stone-900 text-white' : 'border border-stone-300'"
          @click="mode = 'login'"
        >
          {{ t('account.login') }}
        </button>
        <button
          type="button"
          class="flex-1 rounded-lg px-3 py-2 font-medium"
          :class="mode === 'register' ? 'bg-stone-900 text-white' : 'border border-stone-300'"
          @click="mode = 'register'"
        >
          {{ t('account.register') }}
        </button>
      </div>
      <div>
        <label class="block text-xs font-medium text-stone-600" for="email">{{ t('checkout.email') }}</label>
        <input id="email" v-model="email" type="email" required class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
      </div>
      <div v-if="mode === 'register'">
        <label class="block text-xs font-medium text-stone-600" for="nickname">{{ t('account.nickname') }}</label>
        <input id="nickname" v-model="nickname" class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-xs font-medium text-stone-600" for="password">{{ t('account.password') }}</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          minlength="8"
          class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
      </div>
      <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
      <button
        type="submit"
        class="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50"
        :disabled="busy"
      >
        {{ busy ? t('account.processing') : mode === 'login' ? t('account.login') : t('account.registerLogin') }}
      </button>
    </form>
  </div>
</template>
