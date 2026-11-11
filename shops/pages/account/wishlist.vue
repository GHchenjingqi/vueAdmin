<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useWishlist, type WishlistItemView } from '~/composables/useWishlist'
import { useCatalog } from '~/composables/useCatalog'
import { useI18n } from '~/composables/useI18n'
import ProductCard from '~/components/commerce/ProductCard.vue'
import { getToken, getStoredCustomer, type CustomerPublic } from '@shared/customer/auth'

/**
 * 我的收藏页（account/wishlist）：收藏列表 + 取消收藏 + 清空 + 降价提醒开关。
 * 游客仅本地、登录云端；列表复用 ProductCard（SPU 单位）。
 */
const { t, ti } = useI18n()
const wishlist = useWishlist()
const catalog = useCatalog()

const customer = ref<CustomerPublic | null>(getStoredCustomer())
const loggedIn = computed(() => !!customer.value && !!getToken())
const items = ref<WishlistItemView[]>([])
const loading = ref(false)
const error = ref('')
const removing = ref<number | null>(null)

onMounted(async () => {
  await wishlist.load()
  await reload()
})

async function reload(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    items.value = await wishlist.listDetail([...wishlist.ids.value], async (ids) => {
      const res = await catalog.listProducts({ ids, pageSize: ids.length })
      return res.list as unknown as CatalogProduct[]
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('wishlist.loadFailed')
  } finally {
    loading.value = false
  }
}

async function toggleNotify(item: WishlistItemView): Promise<void> {
  const next = !item.notifyOnSale
  item.notifyOnSale = next
  await wishlist.setNotifyOnSale(item.product.id, next)
}

async function removeItem(productId: number): Promise<void> {
  removing.value = productId
  try {
    await wishlist.remove(productId)
    items.value = items.value.filter((i) => i.product.id !== productId)
  } finally {
    removing.value = null
  }
}

async function clearAll(): Promise<void> {
  await wishlist.clear()
  items.value = []
}

useSeo({ title: () => t('wishlist.title'), description: () => t('wishlist.description'), path: '/account/wishlist', noindex: true })
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">{{ t('wishlist.title') }}</h1>
      <button
        v-if="items.length"
        type="button"
        class="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:border-stone-500"
        @click="clearAll"
      >
        {{ t('wishlist.clear') }}
      </button>
    </div>
    <p v-if="items.length" class="mb-4 text-sm text-stone-500">{{ ti('wishlist.total', { count: String(items.length) }) }}</p>

    <div v-if="!loggedIn" class="mb-6 rounded-lg bg-stone-50 px-4 py-3 text-xs text-stone-600">
      {{ t('wishlist.needLogin') }}
      <NuxtLink to="/account" class="ml-1 font-medium underline">{{ t('account.registerLogin') }}</NuxtLink>
    </div>

    <p v-if="error" class="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>

    <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div v-for="n in 4" :key="n" class="h-72 animate-pulse rounded-xl bg-stone-100" />
    </div>

    <div v-else-if="!items.length" class="rounded-xl border border-stone-200 p-12 text-center">
      <p class="text-sm text-stone-600">{{ t('wishlist.empty') }}</p>
      <NuxtLink to="/" class="mt-4 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">
        {{ t('wishlist.backHome') }}
      </NuxtLink>
    </div>

    <ul v-else class="space-y-4">
      <li v-for="item in items" :key="item.product.id" class="flex gap-4 rounded-xl border border-stone-200 p-4">
        <div class="w-28 shrink-0">
          <ProductCard :product="item.product" />
        </div>
        <div class="flex flex-1 flex-col justify-between">
          <div>
            <p class="text-sm font-medium text-stone-900">{{ item.product.title }}</p>
            <label class="mt-2 flex cursor-pointer items-center gap-2 text-xs text-stone-600">
              <input type="checkbox" :checked="item.notifyOnSale" @change="toggleNotify(item)" />
              <span>{{ t('wishlist.notifyOnSale') }}</span>
            </label>
            <p class="mt-1 text-xs text-stone-500">{{ t('wishlist.notifyHint') }}</p>
          </div>
          <button
            type="button"
            class="self-start rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:border-red-400 hover:text-red-600 disabled:opacity-50"
            :disabled="removing === item.product.id"
            @click="removeItem(item.product.id)"
          >
            {{ t('wishlist.remove') }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
