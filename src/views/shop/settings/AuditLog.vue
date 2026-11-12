<script setup lang="ts">
/**
 * 操作审计日志查询页（X-T03）。
 * 后端接口 GET /shop/audit-logs 已支持 entityType(必填) / action / actorId /
 * actorType / from / to / limit / offset 过滤，并返回倒序流水。本页是对前三轮
 * 审计基建（recordAdminAction + 查询接口）的可视化消费端，使管理员可回溯
 * 订单 / 支付 / 库存 / 退款 / 配置等状态变更的留痕。
 */
import { useI18n } from '@/i18n'
import { adminAuditApi } from '@/api/shop'
import { downloadBlob } from '@/utils/download'
import type { AdminAuditLog, AdminAuditQuery } from '@/api/shop'

const { t } = useI18n()

const entityTypeOptions = [
  { value: 'order', label: 'order' },
  { value: 'payment', label: 'payment' },
  { value: 'inventory', label: 'inventory' },
  { value: 'refund', label: 'refund' },
  { value: 'config', label: 'config' },
  { value: 'article', label: 'article' },
]
const actorTypeOptions = [
  { value: 'admin', label: 'admin' },
  { value: 'customer', label: 'customer' },
  { value: 'system', label: 'system' },
]
const limitOptions = [10, 20, 50, 100]

const filters = ref({
  entityType: 'order',
  action: '',
  actorType: '',
  actorId: '',
  dateRange: [] as Date[],
})

const loading = ref(false)
const rows = ref<AdminAuditLog[]>([])
const offset = ref(0)
const limit = ref(20)

/** 把未知值安全转成 ISO 字符串（el-date-picker 默认返回 Date 对象，清空时为 null） */
function toIso(v: unknown): string | undefined {
  if (!v) return undefined
  const d = v instanceof Date ? v : new Date(v as string)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** 审计快照 JSON 友好展示 */
function fmtState(v: unknown): string {
  if (v == null) return ''
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** 操作人标签配色 */
function actorTagType(actorType: string): 'warning' | 'info' | 'success' {
  if (actorType === 'admin') return 'warning'
  if (actorType === 'system') return 'info'
  return 'success'
}

function buildParams(): AdminAuditQuery {
  const f = filters.value
  const params: AdminAuditQuery = {
    entityType: f.entityType,
    limit: limit.value,
    offset: offset.value,
  }
  if (f.action.trim()) params.action = f.action.trim()
  if (f.actorType) params.actorType = f.actorType as AdminAuditQuery['actorType']
  const aid = Number(f.actorId)
  if (f.actorId.trim() && !Number.isNaN(aid)) params.actorId = aid
  const range = f.dateRange
  const from = Array.isArray(range) && range[0] ? toIso(range[0]) : undefined
  const to = Array.isArray(range) && range[1] ? toIso(range[1]) : undefined
  if (from) params.from = from
  if (to) params.to = to
  return params
}

async function query(): Promise<void> {
  if (!filters.value.entityType) {
    ElMessage.warning(t('auditLog.entityTypeRequired', {}, '请选择实体类型'))
    return
  }
  loading.value = true
  try {
    const res = await adminAuditApi.list(buildParams())
    rows.value = Array.isArray(res.data) ? res.data : []
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    ElMessage.error(t('auditLog.loadFailed', {}, '加载审计日志失败') + (msg ? '：' + msg : ''))
  } finally {
    loading.value = false
  }
}

function search(): void {
  offset.value = 0
  void query()
}

// ===== P2-8：导出 + 改前/改后 diff =====
function exportLogs(): void {
  adminAuditApi
    .export(buildParams())
    .then((res) => {
      downloadBlob(new Blob([res.data]), `审计日志_${filters.value.entityType}.xlsx`)
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      ElMessage.error(t('auditLog.exportFailed', {}, '导出失败') + (msg ? '：' + msg : ''))
    })
}

interface DiffField {
  key: string
  before: unknown
  after: unknown
  status: 'added' | 'removed' | 'changed' | 'same'
}
const diffVisible = ref(false)
const diffRow = ref<AdminAuditLog | null>(null)
const diffFields = computed<DiffField[]>(() => {
  const r = diffRow.value
  if (!r) return []
  const b = r.beforeState && typeof r.beforeState === 'object' ? (r.beforeState as Record<string, unknown>) : {}
  const a = r.afterState && typeof r.afterState === 'object' ? (r.afterState as Record<string, unknown>) : {}
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]))
  return keys.map((k) => {
    const bv = b[k]
    const av = a[k]
    let status: DiffField['status'] = 'same'
    if (!(k in b)) status = 'added'
    else if (!(k in a)) status = 'removed'
    else if (JSON.stringify(bv) !== JSON.stringify(av)) status = 'changed'
    return { key: k, before: bv, after: av, status }
  })
})
function openDiff(row: unknown): void {
  diffRow.value = row as AdminAuditLog
  diffVisible.value = true
}
function fmtVal(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function prevPage(): void {
  if (offset.value === 0) return
  offset.value = Math.max(0, offset.value - limit.value)
  void query()
}

function nextPage(): void {
  offset.value += limit.value
  void query()
}

onMounted(() => {
  void query()
})
</script>

<template>
  <div class="p-4">
    <el-card shadow="never">
      <el-form :inline="true" @submit.prevent="search">
        <el-form-item :label="t('auditLog.entityType')">
          <el-select v-model="filters.entityType" style="width: 160px">
            <el-option v-for="o in entityTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('auditLog.action')">
          <el-input v-model="filters.action" :placeholder="t('auditLog.actionPlaceholder')" clearable />
        </el-form-item>
        <el-form-item :label="t('auditLog.actorType')">
          <el-select v-model="filters.actorType" :placeholder="t('auditLog.all')" clearable style="width: 140px">
            <el-option v-for="o in actorTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('auditLog.actorId')">
          <el-input v-model="filters.actorId" :placeholder="t('auditLog.actorIdPlaceholder')" clearable style="width: 120px" />
        </el-form-item>
        <el-form-item :label="t('auditLog.timeRange')">
          <el-date-picker
            v-model="filters.dateRange"
            type="daterange"
            :start-placeholder="t('auditLog.from')"
            :end-placeholder="t('auditLog.to')"
            :range-separator="'-'"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="search">{{ t('auditLog.search') }}</el-button>
          <el-button :loading="loading" @click="exportLogs">{{ t('auditLog.export') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="mt-4">
      <el-table v-loading="loading" :data="rows" border stripe height="560">
        <el-table-column type="index" width="50" />
        <el-table-column prop="createdAt" :label="t('auditLog.time')" width="180" />
        <el-table-column prop="action" :label="t('auditLog.action')" min-width="200" show-overflow-tooltip />
        <el-table-column prop="entityType" :label="t('auditLog.entityType')" width="120" />
        <el-table-column prop="entityId" :label="t('auditLog.entityId')" width="100" />
        <el-table-column :label="t('auditLog.actor')" width="180">
          <template #default="{ row }">
            <el-tag :type="actorTagType(row.actorType)">{{ row.actorType }}{{ row.actorId != null ? ' #' + row.actorId : '' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('auditLog.afterState')" min-width="300">
          <template #default="{ row }">
            <pre class="whitespace-pre-wrap break-all text-xs leading-5">{{ fmtState(row.afterState) }}</pre>
          </template>
        </el-table-column>
        <el-table-column :label="t('auditLog.actions')" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="!row.beforeState && !row.afterState" @click="openDiff(row)">
              {{ t('auditLog.viewDiff') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-dialog v-model="diffVisible" :title="t('auditLog.diffTitle')" width="680px">
        <el-table :data="diffFields" border size="small" max-height="420">
          <el-table-column prop="key" :label="t('auditLog.field')" width="180" show-overflow-tooltip />
          <el-table-column :label="t('auditLog.before')" min-width="200">
            <template #default="{ row }">
              <span :class="row.status === 'removed' ? 'diff-removed' : ''">{{ fmtVal(row.before) }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('auditLog.after')" min-width="200">
            <template #default="{ row }">
              <span :class="row.status === 'added' ? 'diff-added' : row.status === 'changed' ? 'diff-changed' : ''">{{ fmtVal(row.after) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-dialog>

      <div class="flex items-center justify-between mt-3">
        <span class="text-gray-500 text-sm">
          {{ t('auditLog.count', { n: rows.length }, '共 ' + rows.length + ' 条') }}
        </span>
        <div class="flex items-center gap-2">
          <el-button :disabled="offset === 0 || loading" @click="prevPage">{{ t('auditLog.prev') }}</el-button>
          <el-button :disabled="rows.length < limit || loading" @click="nextPage">{{ t('auditLog.next') }}</el-button>
          <el-select v-model="limit" style="width: 110px" @change="search">
            <el-option v-for="n in limitOptions" :key="n" :label="n + ' ' + t('auditLog.page')" :value="n" />
          </el-select>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.diff-added {
  color: #52c41a;
  font-weight: 600;
}
.diff-removed {
  color: #f5222d;
  text-decoration: line-through;
}
.diff-changed {
  color: #fa8c16;
  font-weight: 600;
}
</style>
