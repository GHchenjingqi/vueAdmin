<template>
  <div class="mine-page">
    <div class="mine-head">
      <div>
        <h1>{{ t('portal.mineTitle') }}</h1>
        <p>{{ t('portal.mineSubtitle') }}</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="goPublish">{{ t('portal.navPublish') }}</el-button>
    </div>

    <div class="mine-filters">
      <el-select v-model="statusFilter" :placeholder="t('portal.statusAll')" clearable style="width: 150px" @change="reload">
        <el-option :label="t('prompt.draft')" value="draft" />
        <el-option :label="t('prompt.pending')" value="pending" />
        <el-option :label="t('prompt.published')" value="published" />
        <el-option :label="t('prompt.rejected')" value="rejected" />
        <el-option :label="t('prompt.offline')" value="offline" />
      </el-select>
      <el-input v-model="keyword" :placeholder="t('prompt.keywordPlaceholder')" clearable style="width: 220px" @keyup.enter="reload" @clear="reload">
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <div v-loading="loading" class="mine-card" :class="{ 'mine-table-scroll': isNarrow }">
      <el-table v-if="rows.length" :data="rows" row-key="id" :style="isNarrow ? { minWidth: '900px' } : { width: '100%' }">
        <el-table-column :label="t('prompt.cover')" width="90">
          <template #default="{ row }">
            <el-image v-if="row.coverImage" :src="row.coverImage" fit="cover" class="mine-cover" :preview-src-list="[row.coverImage]" preview-teleported />
            <span v-else class="mine-no-cover">-</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('prompt.title')" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.title }}</template>
        </el-table-column>
        <el-table-column :label="t('prompt.status')" width="110">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('prompt.model')" width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.modelName }}</template>
        </el-table-column>
        <el-table-column :label="t('prompt.rejectReason')" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.rejectReason || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('portal.actions')" width="230" :fixed="isNarrow ? false : 'right'">
          <template #default="{ row }">
            <el-button v-if="canEdit(row.status)" link type="primary" size="small" @click="edit(row.id)">
              {{ t('common.edit') }}
            </el-button>
            <el-button v-if="canEdit(row.status)" link type="success" size="small" @click="submit(row.id)">
              {{ t('portal.submitReview') }}
            </el-button>
            <el-button v-if="row.status !== 'published'" link type="danger" size="small" @click="remove(row.id)">
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else-if="!loading" :description="t('portal.mineEmpty')" />
    </div>

    <div v-if="total > pageSize" class="mine-pagination">
      <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next" background @current-change="fetchList" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { portalApi } from '@/api'
import type { PromptItem, PromptStatus } from '@/api/prompt'
import { useUserStore } from '@/stores'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const rows = ref<PromptItem[]>([])
const keyword = ref('')
const statusFilter = ref<PromptStatus | ''>('')
const page = ref(1)
const pageSize = 10
const total = ref(0)
const loading = ref(false)

const isNarrow = ref(false)
let mq: MediaQueryList | null = null
const syncNarrow = (event: MediaQueryList | MediaQueryListEvent): void => {
  isNarrow.value = event.matches
}

type TagType = 'success' | 'info' | 'warning' | 'danger'
const statusType = (value: unknown): TagType => {
  const map: Record<string, TagType> = { published: 'success', pending: 'warning', rejected: 'danger', offline: 'info', draft: 'info' }
  return map[String(value)] ?? 'info'
}
const statusLabel = (value: unknown): string => {
  const map: Record<string, string> = {
    draft: t('prompt.draft'),
    pending: t('prompt.pending'),
    published: t('prompt.published'),
    rejected: t('prompt.rejected'),
    offline: t('prompt.offline'),
  }
  return map[String(value)] ?? String(value ?? '-')
}
const canEdit = (value: unknown): boolean => value === 'draft' || value === 'rejected'

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await portalApi.getMine({
      page: page.value,
      pageSize,
      keyword: keyword.value || undefined,
      status: statusFilter.value || undefined,
    })
    rows.value = res.data.rows
    total.value = res.data.total
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const reload = (): void => {
  page.value = 1
  void fetchList()
}

const goPublish = (): void => {
  void router.push('/portal/publish')
}

const edit = (id: number): void => {
  void router.push(`/portal/publish/${id}`)
}

const submit = async (id: number): Promise<void> => {
  try {
    await portalApi.submitMine(id)
    ElMessage.success(t('portal.submitSuccess'))
    void fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  }
}

const remove = async (id: number): Promise<void> => {
  try {
    await ElMessageBox.confirm(t('portal.deleteConfirm'), t('common.confirm'), { type: 'warning' })
  } catch {
    return
  }
  try {
    await portalApi.deleteMine(id)
    ElMessage.success(t('portal.deleteSuccess'))
    void fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  }
}

onMounted(() => {
  mq = window.matchMedia('(max-width: 900px)')
  syncNarrow(mq)
  mq.addEventListener('change', syncNarrow)
  if (!userStore.isLoggedIn) {
    ElMessage.warning(t('portal.loginRequired'))
    void router.push({ path: '/portal/login', query: { redirect: route.fullPath } })
    return
  }
  void fetchList()
})

onUnmounted(() => {
  mq?.removeEventListener('change', syncNarrow)
  mq = null
})
</script>

<style scoped>
.mine-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.mine-head h1 {
  margin: 0 0 6px;
  font-size: 24px;
}

.mine-head p {
  margin: 0;
  font-size: 13px;
  color: var(--ink-3);
}

.mine-filters {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  padding: 14px;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.mine-card {
  min-height: 200px;
}

.mine-table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.mine-cover {
  width: 56px;
  height: 42px;
  border-radius: var(--radius-sm);
}

.mine-no-cover {
  color: var(--ink-3);
}

.mine-pagination {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

@media (max-width: 640px) {
  .mine-head h1 {
    font-size: 20px;
  }

  .mine-filters :deep(.el-select),
  .mine-filters :deep(.el-input) {
    width: 100% !important;
  }
}
</style>
