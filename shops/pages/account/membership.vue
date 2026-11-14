<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getStoredCustomer, type CustomerPublic, isAuthenticated } from '@shared/customer/auth'
import { useI18n } from '~/composables/useI18n'

/**
 * 会员中心（account/membership）：等级卡 / 积分 / 成长值进度 / 权益说明。
 * 数据源 GET /api/membership（顾客 JWT）；未登录引导到 /account。
 * 会员系统（C 端顾客）与后台用户管理（B 端管理员）是两套体系，本页只面向顾客。
 */
const { t, ti } = useI18n()
const customer = ref<CustomerPublic | null>(getStoredCustomer())
const loggedIn = computed(() => !!customer.value && isAuthenticated())

interface MembershipView {
  tier: { id: number; name: string; level: number; discountPct: number } | null
  points: number
  growthValue: number
  nextTier: { name: string; level: number; growthThreshold: number; remaining: number } | null
  stats: { loginCount: number; spendAmount: number; orderCount: number; lastLoginAt: string | null }
  progress: { login: number; spend: number; orders: number }
}
const membership = ref<MembershipView | null>(null)
const loading = ref(false)
const error = ref('')

interface PointsLog {
  id: number
  change: number
  balanceAfter: number
  reason: string
  createdAt: string
  note: string | null
}
const logs = ref<PointsLog[]>([])

const progressPct = computed(() => {
  const m = membership.value
  if (!m?.nextTier) return 100
  const from = m.tier ? 0 : 0
  const span = m.nextTier.growthThreshold - from
  return Math.min(100, Math.round(((m.growthValue - from) / Math.max(1, span)) * 100))
})

onMounted(async () => {
  if (!loggedIn.value) return
  loading.value = true
  error.value = ''
  try {
    membership.value = await $fetch<MembershipView>('/api/membership')
    const res = await $fetch<{ list: PointsLog[] }>('/api/membership/points-logs', { query: { page: 1, pageSize: 10 } })
    logs.value = res.list ?? []
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('membership.loadFailed')
  } finally {
    loading.value = false
  }
})

const reasonLabel = (r: string): string =>
  r === 'order_captured' ? t('membership.reasonOrder') : r === 'manual' ? t('membership.reasonManual') : r
</script>

<template>
  <div>
    <h1 class="mb-6 text-2xl font-semibold">{{ t('membership.title') }}</h1>

    <div v-if="!loggedIn" class="rounded-xl border border-stone-200 p-10 text-center">
      <p class="text-sm text-stone-600">{{ t('membership.needLogin') }}</p>
      <NuxtLink to="/account" class="mt-4 inline-block rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">
        {{ t('account.registerLogin') }}
      </NuxtLink>
    </div>

    <template v-else>
      <p v-if="error" class="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>

      <div v-if="loading" class="grid gap-4 sm:grid-cols-3">
        <div v-for="n in 3" :key="n" class="h-28 animate-pulse rounded-xl bg-stone-100" />
      </div>

      <template v-else-if="membership">
        <!-- 等级卡 -->
        <div class="rounded-2xl bg-gradient-to-br from-stone-900 to-stone-700 p-6 text-white">
          <p class="text-xs uppercase tracking-wide text-stone-300">{{ t('membership.currentTier') }}</p>
          <p class="mt-1 text-2xl font-semibold">{{ membership.tier?.name ?? t('membership.noTier') }}</p>
          <p class="mt-1 text-sm text-stone-300">
            {{ membership.tier && membership.tier.discountPct > 0 ? ti('membership.discountBenefit', { pct: String(membership.tier.discountPct) }) : t('membership.baseBenefit') }}
          </p>
          <div class="mt-4">
            <div class="flex items-center justify-between text-xs text-stone-300">
              <span>{{ t('membership.growthValue') }}: {{ membership.growthValue }}</span>
              <span v-if="membership.nextTier">{{ ti('membership.nextTier', { name: membership.nextTier.name, remaining: String(membership.nextTier.remaining) }) }}</span>
              <span v-else>{{ t('membership.topTier') }}</span>
            </div>
            <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-white/20">
              <div class="h-full rounded-full bg-white transition-all" :style="{ width: progressPct + '%' }" />
            </div>
          </div>
        </div>

        <!-- 积分卡 -->
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <div class="rounded-xl border border-stone-200 p-5">
            <p class="text-xs uppercase tracking-wide text-stone-500">{{ t('membership.points') }}</p>
            <p class="mt-1 text-3xl font-semibold tabular-nums">{{ membership.points }}</p>
          </div>
          <div class="rounded-xl border border-stone-200 p-5">
            <p class="text-xs uppercase tracking-wide text-stone-500">{{ t('membership.growthValue') }}</p>
            <p class="mt-1 text-3xl font-semibold tabular-nums">{{ membership.growthValue }}</p>
          </div>
        </div>

        <!-- 三维度分级进度（登录频率 / 消费金额 / 消费次数） -->
        <div v-if="membership.nextTier" class="mt-4 rounded-xl border border-stone-200 p-5">
          <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">{{ t('membership.dimensions') }}</p>
          <div class="space-y-3">
            <div>
              <div class="flex items-center justify-between text-xs text-stone-500">
                <span>{{ t('membership.dimLogin') }}</span>
                <span>{{ membership.stats.loginCount }}</span>
              </div>
              <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div class="h-full rounded-full bg-stone-700" :style="{ width: membership.progress.login + '%' }" />
              </div>
            </div>
            <div>
              <div class="flex items-center justify-between text-xs text-stone-500">
                <span>{{ t('membership.dimSpend') }}</span>
                <span>{{ membership.stats.spendAmount }}</span>
              </div>
              <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div class="h-full rounded-full bg-stone-700" :style="{ width: membership.progress.spend + '%' }" />
              </div>
            </div>
            <div>
              <div class="flex items-center justify-between text-xs text-stone-500">
                <span>{{ t('membership.dimOrders') }}</span>
                <span>{{ membership.stats.orderCount }}</span>
              </div>
              <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div class="h-full rounded-full bg-stone-700" :style="{ width: membership.progress.orders + '%' }" />
              </div>
            </div>
          </div>
        </div>

        <!-- 积分流水 -->
        <h2 class="mb-3 mt-8 text-lg font-semibold">{{ t('membership.pointsHistory') }}</h2>
        <div v-if="logs.length === 0" class="rounded-xl border border-stone-200 p-8 text-center text-sm text-stone-500">
          {{ t('membership.noRecords') }}
        </div>
        <ul v-else class="divide-y divide-stone-200 rounded-xl border border-stone-200">
          <li v-for="log in logs" :key="log.id" class="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p class="font-medium text-stone-900">{{ reasonLabel(log.reason) }}</p>
              <p class="text-xs text-stone-500">{{ new Date(log.createdAt).toLocaleDateString() }}</p>
            </div>
            <div class="text-right">
              <p class="font-semibold tabular-nums" :class="log.change > 0 ? 'text-green-700' : 'text-red-600'">
                {{ log.change > 0 ? '+' : '' }}{{ log.change }}
              </p>
              <p class="text-xs text-stone-500">{{ t('membership.balanceAfter') }}: {{ log.balanceAfter }}</p>
            </div>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>
