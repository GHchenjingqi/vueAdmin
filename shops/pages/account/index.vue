<script setup lang="ts">
import { ref, computed } from 'vue'
import { register, login, logout, getStoredCustomer, getToken, me, type CustomerPublic } from '@shared/customer/auth'
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
const loggedIn = computed(() => !!customer.value && !!getToken())

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
          <NuxtLink to="/account/addresses" class="block rounded-lg border border-stone-200 px-4 py-3 hover:border-stone-400">{{ t('account.addressBook') }}</NuxtLink>
          <NuxtLink to="/account/rma" class="block rounded-lg border border-stone-200 px-4 py-3 hover:border-stone-400">{{ t('account.rma') }}</NuxtLink>
          <NuxtLink to="/policies/returns" class="block rounded-lg border border-stone-200 px-4 py-3 hover:border-stone-400">{{ t('account.returnsPolicy') }}</NuxtLink>
        </div>
        <button type="button" class="mt-5 w-full rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-medium hover:border-stone-500" @click="doLogout">
          {{ t('account.logout') }}
        </button>
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
