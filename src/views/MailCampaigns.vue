<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">邮件营销</h2>
      <p class="page-desc">对会员（C 端顾客）与用户（B 端管理员）发送邮件。SMTP 未配置时任务保持待发送，可重试。</p>
    </div>

    <el-card shadow="never" class="mb-4">
      <div class="toolbar">
        <span class="stat">会员：{{ stats.customers }}</span>
        <span class="stat">用户：{{ stats.users }}</span>
        <div class="spacer" />
        <el-button type="primary" @click="openCreate">新建邮件</el-button>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="rows" border stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="subject" label="主题" min-width="200" show-overflow-tooltip />
        <el-table-column label="受众" width="140">
          <template #default="{ row }">{{ audienceLabel(row.audienceType, row.audienceParam) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发送/失败/总数" width="130" align="center">
          <template #default="{ row }">{{ row.sentCount }} / {{ row.failedCount }} / {{ row.totalCount }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="170">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openRecipients(row as CampaignRow)">收件人</el-button>
            <el-button link type="success" :disabled="row.status === 'sent'" @click="send(row as CampaignRow)">发送</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        :total="total"
        layout="total, prev, pager, next"
        class="mt-4"
        @current-change="load"
      />
    </el-card>

    <!-- 新建邮件 -->
    <el-dialog v-model="createVisible" title="新建邮件" width="560px">
      <el-form label-width="90px">
        <el-form-item label="受众">
          <el-select v-model="form.audienceType" style="width: 100%" @change="form.audienceParam = ''">
            <el-option label="全体会员（顾客）" value="all_customers" />
            <el-option label="指定等级会员" value="tier" />
            <el-option label="全体用户（管理员）" value="all_users" />
            <el-option label="指定邮箱" value="emails" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.audienceType === 'tier'" label="等级">
          <el-select v-model="form.audienceParam" style="width: 100%" placeholder="选择会员等级">
            <el-option v-for="t in tiers" :key="t.id" :label="`${t.name}（${t.growthThreshold}元门槛）`" :value="String(t.id)" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.audienceType === 'emails'" label="邮箱">
          <el-input v-model="form.audienceParam" placeholder="多个邮箱用逗号分隔" />
        </el-form-item>
        <el-form-item label="主题">
          <el-input v-model="form.subject" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="正文">
          <el-input v-model="form.body" type="textarea" :rows="6" placeholder="支持变量：{{nickname}} {{points}} {{tier}}" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createBusy" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 收件人明细 -->
    <el-drawer v-model="recipientsVisible" title="收件人明细" size="520px">
      <el-table :data="recipients" size="small" border>
        <el-table-column prop="email" label="邮箱" min-width="180" show-overflow-tooltip />
        <el-table-column label="类型" width="80">
          <template #default="{ row }">{{ row.recipientType === 'customer' ? '会员' : row.recipientType === 'user' ? '用户' : '直发' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'sent' ? 'success' : row.status === 'failed' ? 'danger' : 'info'" size="small">
              {{ row.status === 'sent' ? '已发送' : row.status === 'failed' ? '失败' : '待发送' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="error" label="失败原因" min-width="140" show-overflow-tooltip />
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { shopMailApi } from '@/api'

/**
 * 邮件营销：对会员（customers）与用户（users）群发。
 * outbox 模式：创建（解析受众）→ 发送（逐封 SMTP，可重试）→ 收件人明细可溯。
 */
defineOptions({ name: 'MailCampaigns' })

interface CampaignRow {
  id: number
  subject: string
  body: string
  audienceType: string
  audienceParam: string | null
  status: string
  totalCount: number
  sentCount: number
  failedCount: number
  createdAt: string
}

const loading = ref(false)
const rows = ref<CampaignRow[]>([])
const total = ref(0)
const query = reactive({ page: 1, pageSize: 20 })
const stats = ref({ customers: 0, users: 0 })
const tiers = ref<{ id: number; name: string; growthThreshold: number }[]>([])

async function load(): Promise<void> {
  loading.value = true
  try {
    const res = await shopMailApi.list({ ...query })
    rows.value = res.data.list as CampaignRow[]
    total.value = res.data.total
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载失败')
  } finally {
    loading.value = false
  }
}

async function loadStats(): Promise<void> {
  try {
    const res = await shopMailApi.audienceStats()
    stats.value = res.data
  } catch {
    /* 概览失败不影响主流程 */
  }
}

async function loadTiers(): Promise<void> {
  try {
    const res = await shopMailApi.tiers()
    tiers.value = res.data
  } catch {
    /* 等级加载失败不影响主流程 */
  }
}

// 新建
const createVisible = ref(false)
const createBusy = ref(false)
const form = reactive({ audienceType: 'all_customers', audienceParam: '', subject: '', body: '' })
function openCreate(): void {
  form.audienceType = 'all_customers'
  form.audienceParam = ''
  form.subject = ''
  form.body = ''
  createVisible.value = true
}
async function submitCreate(): Promise<void> {
  if (!form.subject.trim() || !form.body.trim()) {
    ElMessage.warning('主题与正文不能为空')
    return
  }
  createBusy.value = true
  try {
    const res = await shopMailApi.create({
      subject: form.subject,
      body: form.body,
      audienceType: form.audienceType,
      audienceParam: form.audienceParam || undefined,
    })
    ElMessage.success(`已创建任务，收件人 ${res.data.recipientCount} 个`)
    createVisible.value = false
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '创建失败')
  } finally {
    createBusy.value = false
  }
}

// 发送
async function send(row: CampaignRow): Promise<void> {
  try {
    const res = await shopMailApi.send(row.id)
    ElMessage.success(`发送完成：成功 ${res.data.sent}，失败 ${res.data.failed}（SMTP 未配置时任务保留待发送）`)
    await load()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '发送失败')
  }
}

// 收件人
const recipientsVisible = ref(false)
const recipients = ref<{ email: string; recipientType: string; status: string; error: string | null }[]>([])
async function openRecipients(row: CampaignRow): Promise<void> {
  try {
    const res = await shopMailApi.recipients(row.id)
    recipients.value = res.data.list
    recipientsVisible.value = true
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '加载收件人失败')
  }
}

function audienceLabel(type: string, param: string | null): string {
  if (type === 'all_customers') return '全体会员'
  if (type === 'all_users') return '全体用户'
  if (type === 'tier') {
    const t = tiers.value.find((x) => String(x.id) === param)
    return `等级会员${t ? `·${t.name}` : ''}`
  }
  return '指定邮箱'
}
function statusLabel(s: string): string {
  return { pending: '待发送', sending: '发送中', sent: '已发送', partial: '部分成功', failed: '失败' }[s] ?? s
}
function statusTag(s: string): 'primary' | 'success' | 'warning' | 'info' | 'danger' {
  return ({ pending: 'info', sending: 'warning', sent: 'success', partial: 'warning', failed: 'danger' } as const)[s] ?? 'info'
}

onMounted(() => {
  load()
  loadStats()
  loadTiers()
})
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
}
.spacer {
  flex: 1;
}
.stat {
  font-size: 13px;
  color: #606266;
}
.page-desc {
  color: #909399;
  font-size: 13px;
  margin-top: 4px;
}
</style>
