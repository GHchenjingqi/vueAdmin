<script setup lang="ts">
/**
 * 支付通道后台配置：勾选启用 + 凭据状态回显 + 商户标识登记 + 支付凭据配置。
 * 支付凭据（密钥/证书）现由本页录入：保存后 AES-256-GCM 加密落库（DB 主），
 * 未配置项回退到服务端环境变量，绝不回显明文、绝不落 settings 全局明文表。
 */
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

interface CredField {
  key: string
  label: string
  secret: boolean
  multiline: boolean
  present: boolean
  value: string
}
interface CredProvider {
  id: string
  label: string
  configured: boolean
  fields: CredField[]
}

const loading = ref(false)
const saving = ref(false)
const savingCredId = ref<string | null>(null)
const enabled = ref<string[]>([])
const channels = ref<Channel[]>([])
const accounts = ref<Record<string, Record<string, string>>>({})
const activeCurrency = ref('')
const legacyMode = ref(false)
const usable = ref<{ id: string; label: string }[]>([])

const credProviders = ref<CredProvider[]>([])
const credDrafts = ref<Record<string, Record<string, string>>>({})

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
    await loadCredentials()
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

async function loadCredentials(): Promise<void> {
  try {
    const res = unwrap(await request.get('/shop/settings/payment-channels/credentials'))
    const data = res?.data ?? res
    const providers: CredProvider[] = Array.isArray(data?.providers) ? data.providers : []
    credProviders.value = providers
    const drafts: Record<string, Record<string, string>> = {}
    for (const p of providers) {
      drafts[p.id] = {}
      for (const f of p.fields) {
        // 非敏感字段预填当前值；敏感字段留空（占位提示显示掩码，避免回显明文）
        drafts[p.id][f.key] = f.secret ? '' : (f.value ?? '')
      }
    }
    credDrafts.value = drafts
  } catch (err: any) {
    ElMessage.error('加载支付凭据配置失败：' + (err?.message ?? String(err)))
  }
}

async function save(): Promise<void> {
  if (notConfiguredCount.value > 0) {
    try {
      await ElMessageBox.confirm(
        `有 ${notConfiguredCount.value} 个已勾选通道未配置凭据（后台未填写且环境变量也未设置），保存后前台会拒绝对其建会话（503）。是否继续？`,
        '凭据未就绪',
        { type: 'warning' },
      )
    } catch {
      return
    }
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

async function saveCredentials(providerId: string): Promise<void> {
  try {
    await ElMessageBox.confirm('保存后凭据将以 AES-256-GCM 加密写入数据库（环境变量作为兜底）。未填写的字段将保留原值。确认提交？', '保存支付凭据', {
      type: 'warning',
    })
  } catch {
    return
  }
  const draft = credDrafts.value[providerId] ?? {}
  savingCredId.value = providerId
  try {
    await request.put('/shop/settings/payment-channels/credentials', { provider: providerId, credentials: draft, confirmImpact: true })
    ElMessage.success('支付凭据已加密保存')
    await loadCredentials()
    await reload()
  } catch (err: any) {
    ElMessage.error('保存失败：' + (err?.message ?? String(err)))
  } finally {
    savingCredId.value = null
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
              {{ ch.configured ? '凭据已配置' : '凭据缺失（后台或环境变量）' }}
            </div>
            <div v-if="ch.missing" class="max-w-md truncate text-gray-400" :title="ch.missing">{{ ch.missing }}</div>
          </div>
        </div>
      </el-checkbox-group>

      <div class="mt-4 flex items-center gap-3">
        <el-button type="primary" :loading="saving" @click="save">保存并立即生效</el-button>
        <el-button @click="reload">刷新</el-button>
        <span class="text-xs text-gray-500">凭据现可在下方「支付凭据配置」中录入，保存后加密落库，环境变量仅作兜底。</span>
      </div>
    </el-card>

    <el-card shadow="never" class="mb-4">
      <template #header><span class="font-semibold">支付凭据配置（加密落库，环境变量兜底）</span></template>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="mb-4"
        title="凭据安全说明"
        description="密钥 / 证书经 AES-256-GCM 加密后写入数据库，仅本页可见掩码；留空的字段表示保留原值，不会覆盖已保存内容。"
      />
      <div v-if="!credProviders.length" class="text-sm text-gray-500">无可用真实通道凭据配置。</div>
      <div v-for="p in credProviders" :key="p.id" class="mb-4 rounded border border-gray-200 p-4">
        <div class="mb-3 flex items-center gap-2">
          <span class="font-medium">{{ p.label }}</span>
          <span class="text-xs text-gray-400">{{ p.id }}</span>
          <el-tag :type="p.configured ? 'success' : 'warning'" size="small">{{ p.configured ? '已就绪' : '待补全' }}</el-tag>
        </div>
        <el-form label-width="160px" class="cred-form">
          <el-form-item v-for="f in p.fields" :key="f.key" :label="f.label">
            <!-- PEM 私钥/公钥为多行文本：必须用 textarea，单行 input 粘贴会丢换行导致验签失败 -->
            <el-input
              v-if="f.multiline"
              v-model="credDrafts[p.id][f.key]"
              type="textarea"
              :rows="4"
              :placeholder="f.present ? `已配置（掩码 ${f.value}，留空保留原值）` : '未配置，请粘贴完整 PEM（含 BEGIN/END 行）'"
            />
            <el-input
              v-else-if="f.secret"
              v-model="credDrafts[p.id][f.key]"
              type="password"
              show-password
              :placeholder="f.present ? `已配置（掩码 ${f.value}）` : '未配置，请输入'"
            />
            <el-input v-else v-model="credDrafts[p.id][f.key]" :placeholder="f.present ? '已配置（留空保留）' : '请输入'" />
          </el-form-item>
        </el-form>
        <div class="flex justify-end">
          <el-button type="primary" :loading="savingCredId === p.id" @click="saveCredentials(p.id)">保存凭据</el-button>
        </div>
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header><span class="font-semibold">当前币种实际可用通道（勾选 + 凭据 + 币种能力）</span></template>
      <div v-if="!usable.length" class="text-sm text-gray-500">无可用通道，请检查勾选与币种配置。</div>
      <el-tag v-for="u in usable" :key="u.id" class="mr-2 mb-2">{{ u.label }}（{{ u.id }}）</el-tag>
    </el-card>
  </div>
</template>
