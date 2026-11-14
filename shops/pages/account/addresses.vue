<script setup lang="ts">
import { ref } from 'vue'
import { getToken, getStoredCustomer, isAuthenticated } from '@shared/customer/auth'
import { useI18n } from '~/composables/useI18n'

/**
 * 地址簿（P4-T02）：列表/新增/编辑/删除/设默认（唯一）。
 * 端点：/api/addresses（BFF 直通真实后台，Bearer 顾客 JWT）。
 * 删除默认地址自动提升（后端兜底）。文案接入 i18n（P5-T01）。
 */
const { t, ti } = useI18n()
interface AddressItem {
  id: number
  fullName: string
  phone: string
  country: string
  province: string
  city: string
  address1: string
  address2?: string | null
  postcode: string
  isDefault: boolean
}

const customer = getStoredCustomer()
if (!isAuthenticated()) await navigateTo('/account', { replace: true })

const list = ref<AddressItem[]>([])
const loading = ref(true)
const editing = ref<AddressItem | null>(null)
const showForm = ref(false)
const form = ref({ fullName: '', phone: '', country: 'US', province: '', city: '', address1: '', postcode: '', isDefault: false })
const error = ref('')

function authHeaders(): Record<string, string> {
  return { 'content-type': 'application/json', ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}) }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await $fetch<{ code: number; data: AddressItem[] }>('/api/addresses')
    list.value = res.data ?? []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}
await load()

function openCreate(): void {
  editing.value = null
  form.value = { fullName: '', phone: '', country: 'US', province: '', city: '', address1: '', postcode: '', isDefault: false }
  showForm.value = true
  error.value = ''
}

function openEdit(a: AddressItem): void {
  editing.value = a
  form.value = {
    fullName: a.fullName,
    phone: a.phone,
    country: a.country,
    province: a.province,
    city: a.city,
    address1: a.address1,
    postcode: a.postcode,
    isDefault: a.isDefault,
  }
  showForm.value = true
  error.value = ''
}

async function save(): Promise<void> {
  error.value = ''
  try {
    if (editing.value) await $fetch(`/api/addresses/${editing.value.id}`, { method: 'PATCH', headers: authHeaders(), body: form.value })
    else await $fetch('/api/addresses', { method: 'POST', headers: authHeaders(), body: form.value })
    showForm.value = false
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('addresses.saveFailed')
  }
}

async function remove(a: AddressItem): Promise<void> {
  await $fetch(`/api/addresses/${a.id}`, { method: 'DELETE', headers: authHeaders() })
  await load()
}

async function makeDefault(a: AddressItem): Promise<void> {
  await $fetch(`/api/addresses/${a.id}/default`, { method: 'POST', headers: authHeaders() })
  await load()
}

useSeo({ title: () => t('addresses.title'), description: () => t('addresses.description'), path: '/account/addresses', noindex: true })
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-5">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{{ t('addresses.title') }}</h1>
      <button type="button" class="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700" @click="openCreate">{{ t('addresses.add') }}</button>
    </div>

    <form v-if="showForm" class="space-y-2 rounded-xl border border-stone-200 p-5" @submit.prevent="save">
      <h2 class="text-sm font-semibold">{{ editing ? t('addresses.edit') : t('addresses.add') }}</h2>
      <div class="grid grid-cols-2 gap-2">
        <input v-model="form.fullName" required :placeholder="t('addresses.recipient')" class="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        <input v-model="form.phone" required :placeholder="t('addresses.phone')" class="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        <input v-model="form.country" required maxlength="2" :placeholder="t('addresses.countryHint')" class="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        <input v-model="form.postcode" required :placeholder="t('addresses.zip')" class="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        <input v-model="form.province" required :placeholder="t('addresses.state')" class="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        <input v-model="form.city" required :placeholder="t('addresses.city')" class="rounded-lg border border-stone-300 px-3 py-2 text-sm" />
      </div>
      <input v-model="form.address1" required :placeholder="t('addresses.address')" class="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
      <label class="flex items-center gap-2 text-xs text-stone-500">
        <input v-model="form.isDefault" type="checkbox" />
        {{ t('addresses.setDefaultAddress') }}
      </label>
      <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
      <div class="flex gap-2">
        <button type="submit" class="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700">{{ t('addresses.save') }}</button>
        <button type="button" class="rounded-lg border border-stone-300 px-4 py-2 text-sm" @click="showForm = false">{{ t('addresses.cancel') }}</button>
      </div>
    </form>

    <div v-if="loading" class="text-sm text-stone-500">{{ t('addresses.loading') }}</div>
    <p v-else-if="list.length === 0" class="rounded-xl border border-stone-200 p-8 text-center text-sm text-stone-500">{{ t('addresses.empty') }}</p>
    <ul v-else class="space-y-3">
      <li v-for="a in list" :key="a.id" class="rounded-xl border border-stone-200 p-4 text-sm" :class="a.isDefault ? 'border-stone-900' : ''">
        <div class="flex items-center justify-between">
          <span class="font-medium">
            {{ a.fullName }} · {{ a.phone }}
            <span v-if="a.isDefault" class="ml-1 rounded-full bg-stone-900 px-2 py-0.5 text-[10px] text-white">{{ t('addresses.default') }}</span>
          </span>
        </div>
        <p class="mt-1 text-stone-600">{{ a.country }} {{ a.province }} {{ a.city }} · {{ a.address1 }} · {{ a.postcode }}</p>
        <div class="mt-2 flex gap-3 text-xs">
          <button type="button" class="text-stone-600 underline hover:text-stone-900" @click="openEdit(a)">{{ t('addresses.edit') }}</button>
          <button v-if="!a.isDefault" type="button" class="text-stone-600 underline hover:text-stone-900" @click="makeDefault(a)">{{ t('addresses.setDefault') }}</button>
          <button type="button" class="text-red-600 underline hover:text-red-800" @click="remove(a)">{{ t('addresses.delete') }}</button>
        </div>
      </li>
    </ul>

    <p class="text-xs text-stone-400">{{ ti('addresses.identity', { email: customer?.email ?? '' }) }}</p>
  </div>
</template>
