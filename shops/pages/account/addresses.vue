<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getToken } from '@shared/customer/auth'
import {
  listAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress,
  type AddressForm, type CustomerAddress,
} from '@shared/customer/address'

/**
 * P4-T02 地址簿（顾客登录态）
 * 归属校验与默认地址兜底全部在服务端；本页只做表单与展示，不缓存他人数据。
 * 鉴权 token 存 localStorage，故初始化放在 onMounted（SSR 阶段不渲染任何私有数据）。
 */
const addresses = ref<CustomerAddress[]>([])
const ready = ref(false)
const busy = ref(false)
const error = ref('')
const message = ref('')
const editingId = ref<number | null>(null)

const blank = (): AddressForm => ({
  fullName: '', phone: '', country: '', province: '', city: '',
  address1: '', address2: '', postcode: '', isDefault: false,
})
const form = ref<AddressForm>(blank())

async function load(): Promise<void> {
  try {
    addresses.value = await listAddresses()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '地址加载失败'
  }
}

onMounted(async () => {
  if (!getToken()) {
    await navigateTo('/account', { replace: true })
    return
  }
  await load()
  ready.value = true
})

function resetForm(): void {
  form.value = blank()
  editingId.value = null
}

function edit(a: CustomerAddress): void {
  editingId.value = a.id
  form.value = {
    fullName: a.fullName, phone: a.phone, country: a.country,
    province: a.province, city: a.city, address1: a.address1,
    address2: a.address2 ?? '', postcode: a.postcode, isDefault: a.isDefault,
  }
  message.value = ''
  error.value = ''
}

async function save(): Promise<void> {
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    if (editingId.value !== null) {
      await updateAddress(editingId.value, form.value)
      message.value = '地址已更新'
    } else {
      await createAddress(form.value)
      message.value = '地址已添加'
    }
    resetForm()
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    busy.value = false
  }
}

async function makeDefault(a: CustomerAddress): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await setDefaultAddress(a.id)
    message.value = '已设为默认地址'
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '操作失败'
  } finally {
    busy.value = false
  }
}

async function remove(a: CustomerAddress): Promise<void> {
  if (typeof window !== 'undefined' && !window.confirm(`确定删除「${a.address1}」？`)) return
  busy.value = true
  error.value = ''
  try {
    const result = await deleteAddress(a.id)
    message.value = result.promotedId ? '已删除，系统已自动指定新的默认地址' : '地址已删除'
    if (editingId.value === a.id) resetForm()
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除失败'
  } finally {
    busy.value = false
  }
}

useSeo({ title: '地址簿', description: '管理我的收货地址', path: '/account/addresses' })
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">收货地址簿</h1>
      <NuxtLink to="/account" class="text-sm text-stone-500 hover:text-stone-900">← 返回账户</NuxtLink>
    </div>

    <template v-if="ready">
      <section class="rounded-xl border border-stone-200 p-5">
        <h2 class="mb-3 text-sm font-semibold">我的地址</h2>
        <p v-if="addresses.length === 0" class="text-sm text-stone-500">暂无地址，请在下方添加。</p>
        <ul v-else class="space-y-3">
          <li v-for="a in addresses" :key="a.id" class="rounded-lg border border-stone-200 px-4 py-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="text-sm">
                <p class="font-medium">
                  {{ a.fullName }} · {{ a.phone }}
                  <span v-if="a.isDefault" class="ml-2 rounded bg-stone-900 px-2 py-0.5 text-xs text-white">默认</span>
                </p>
                <p class="mt-1 text-stone-600">
                  {{ a.address1 }}<template v-if="a.address2">, {{ a.address2 }}</template>,
                  {{ a.city }}, {{ a.province }} {{ a.postcode }}, {{ a.country }}
                </p>
              </div>
              <div class="flex shrink-0 gap-3 text-xs text-stone-600">
                <button v-if="!a.isDefault" type="button" class="hover:text-stone-900 disabled:opacity-50" :disabled="busy" @click="makeDefault(a)">设为默认</button>
                <button type="button" class="hover:text-stone-900 disabled:opacity-50" :disabled="busy" @click="edit(a)">编辑</button>
                <button type="button" class="text-red-600 hover:text-red-800 disabled:opacity-50" :disabled="busy" @click="remove(a)">删除</button>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <form class="space-y-3 rounded-xl border border-stone-200 p-5" @submit.prevent="save">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">{{ editingId !== null ? '编辑地址' : '新增地址' }}</h2>
          <button v-if="editingId !== null" type="button" class="text-xs text-stone-500 hover:text-stone-900" @click="resetForm">取消编辑</button>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="text-xs font-medium text-stone-600">收件人
            <input v-model="form.fullName" required maxlength="120" class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          </label>
          <label class="text-xs font-medium text-stone-600">联系电话
            <input v-model="form.phone" required maxlength="32" class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          </label>
          <label class="text-xs font-medium text-stone-600">国家码（两位 ISO）
            <input v-model="form.country" required maxlength="2" minlength="2" placeholder="US" class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm uppercase" />
          </label>
          <label class="text-xs font-medium text-stone-600">邮编
            <input v-model="form.postcode" required maxlength="20" class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          </label>
          <label class="text-xs font-medium text-stone-600">省 / 州
            <input v-model="form.province" required maxlength="64" class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          </label>
          <label class="text-xs font-medium text-stone-600">城市
            <input v-model="form.city" required maxlength="64" class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          </label>
        </div>
        <label class="block text-xs font-medium text-stone-600">详细地址
          <input v-model="form.address1" required maxlength="255" class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        </label>
        <label class="block text-xs font-medium text-stone-600">地址补充（可选）
          <input v-model="form.address2" maxlength="255" class="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
        </label>
        <label class="flex items-center gap-2 text-xs text-stone-600">
          <input v-model="form.isDefault" type="checkbox" class="rounded border-stone-300" />
          设为默认地址
        </label>
        <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
        <p v-if="message" class="text-xs text-emerald-700">{{ message }}</p>
        <button type="submit" class="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50" :disabled="busy">
          {{ busy ? '处理中…' : editingId !== null ? '保存修改' : '添加地址' }}
        </button>
      </form>
    </template>
    <p v-else class="text-sm text-stone-500">正在加载地址…</p>
  </div>
</template>
