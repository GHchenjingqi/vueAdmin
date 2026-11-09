<script setup lang="ts">
/**
 * 支付通道后台配置：勾选启用 + 凭据状态回显 + 商户标识登记。
 * 密钥/证书一律走环境变量（不在此页录入、不落 settings 表）。
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import request from '@/utils/request'

interface Channel {
  id: string
  label: string
  kind: string
  supportedCurrencies: string[]
  allCurrencies: boolean
  enabled: boolean
  configured: boolean
  missing?: string
}

const loading = ref(false)
const saving = ref(false)
const enabled = ref<string[]>([])
const channels = ref<Channel[]>([])
const accounts = ref<Record<string, Record<string, string>>>({})
const activeCurrency = ref('')
const legacyMode = ref(false)
const usable = ref<{ id: string; label: string }[]>([])

/** 兼容 request 封装的多种响应形态 */
function unwrap(res: any): any {
  return res?.data?.data ?? res?.data ?? res ?? {}
}

const notConfiguredCount = computed(() => channels.value.filter((c) => c.enabled && !c.configured).length)

async function reload(): Promise<void> {
  loading.value = true
  try {
    const res = unwrap(await request.get('/shop/settings/payment-channels'))
    const data = res?.data ?? res
    channels.value = Array.isArray(data?.channels) ? data.channels : []
    enabled.value = Array.isArray(data?.enabled) ? [...data.enabled] : []
    accounts.value = data?.accounts ?? {}
    activeCurrency.value = data?.activeCurrency ?? ''
    legacyMode.value = !data?.configured
    await loadState()
  } catch (err: any) {
    ElMessage.error('加载支付通道配置失败：' + (err?.message ?? String(err)))
  } finally {
    loading.value = false
  }
}

async function loadState(): Promise<void> {
  try {
    const res = unwrap(await request.get('/shop/settings/payment-channels/state'))
    const data = res?.data ?? res
    usable.value = Array.isArray(data?.usable) ? data.usable : []
    if (data?.currency) activeCurrency.value = data.currency
    legacyMode.value = !!data?.legacyMode
  } catch {
    usable.value = []
  }
}

async function save(): Promise<void> {
  if (notConfiguredCount.value > 0) {
    await ElMessageBox.confirm(`有 ${notConfiguredCount.value} 个已勾选通道缺少环境变量凭据，保存后前台会拒绝对其建会话（503）。是否继续？`, '凭据未就绪', {
      type: 'warning',
    })
  }
  saving.value = true
  try {
    await request.put('/shop/settings/payment-channels', { enabled: enabled.value, accounts: accounts.value, confirmImpact: true })
    ElMessage.success('支付通道配置已保存并立即生效')
    await reload()
  } catch (err: any) {
    ElMessage.error('保存失败：' + (err?.message ?? String(err)))
  } finally {
    saving.value = false
  }
}

onMounted(reload)
</script>

<template>
  <div v-loading="loading" class="p-4">
    <el-card shadow="never" class="mb-4">
      <template #header><span class="font-semibold">支付通道配置</span></template>
      <el-alert
        v-if="legacyMode"
        type="warning"
        :closable="false"
        show-icon
        title="尚未保存过配置（兼容模式）"
        description="当前仅 mock 沙箱通道可用。勾选并保存后，前台严格按勾选结果展示，未勾选的通道既不显示也不能结算。"
        class="mb-4"
      />
      <el-alert
        v-else
        type="info"
        :closable="false"
        show-icon
        :title="`当前启用币种：${activeCurrency || '未读取'}`"
        description="通道按后台币种自动切换；银联 / 云闪付为全币种通道，任何币种都会显示，外币金额按订单快照原样送网关、不做换算。"
        class="mb-4"
      />

      <el-checkbox-group v-model="enabled" class="w-full">
        <div v-for="ch in channels" :key="ch.id" class="mb-2 flex items-start gap-3 rounded border border-gray-200 p-3">
          <el-checkbox :value="ch.id" class="!mr-0">
            <span class="font-medium">{{ ch.label }}</span>
            <span class="ml-2 text-xs text-gray-400">{{ ch.id }}</span>
          </el-checkbox>
          <div class="ml-auto text-right text-xs">
            <div v-if="ch.allCurrencies" class="text-blue-600">全币种（含 {{ activeCurrency }}）</div>
            <div v-else class="text-gray-500">支持 {{ ch.supportedCurrencies.join(' / ') }}</div>
            <div :class="ch.configured ? 'text-green-600' : 'text-orange-600'">
              {{ ch.configured ? '凭据已配置' : '凭据缺失（环境变量）' }}
            </div>
            <div v-if="ch.missing" class="max-w-md truncate text-gray-400" :title="ch.missing">{{ ch.missing }}</div>
          </div>
        </div>
      </el-checkbox-group>

      <div class="mt-4 flex items-center gap-3">
        <el-button type="primary" :loading="saving" @click="save">保存并立即生效</el-button>
        <el-button @click="reload">刷新</el-button>
        <span class="text-xs text-gray-500">密钥/证书通过服务端环境变量配置，不在后台页面录入或落库。</span>
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header><span class="font-semibold">当前币种实际可用通道（勾选 + 凭据 + 币种能力）</span></template>
      <div v-if="!usable.length" class="text-sm text-gray-500">无可用通道，请检查勾选与币种配置。</div>
      <el-tag v-for="u in usable" :key="u.id" class="mr-2 mb-2">{{ u.label }}（{{ u.id }}）</el-tag>
    </el-card>
  </div>
</template>
