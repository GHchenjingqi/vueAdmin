<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('prompt.reviewTitle')"
      :columns="columns"
      :data="rows"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      column-settings-key="prompt_review_list"
      @query="onQuery"
    >
      <template #column-coverImage="{ row }">
        <el-image v-if="row.coverImage" :src="String(row.coverImage)" fit="cover" class="prompt-cover" :preview-src-list="[String(row.coverImage)]" />
        <span v-else>-</span>
      </template>

      <template #column-createdAt="{ row }">
        {{ formatDate(row.createdAt) }}
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="primary" link size="small" @click="openDetail(row)">{{ t('common.view') }}</el-button>
          <el-button type="success" link size="small" @click="handleApprove(row)">{{ t('prompt.approve') }}</el-button>
          <el-button type="danger" link size="small" @click="handleReject(row)">{{ t('prompt.reject') }}</el-button>
        </div>
      </template>
    </ProTable>

    <el-dialog v-model="detailVisible" :title="t('prompt.viewDetail')" width="720px" top="6vh" destroy-on-close>
      <template v-if="detail">
        <h3 class="prompt-detail-title">{{ detail.title }}</h3>
        <p class="prompt-detail-meta">{{ detail.categoryName }} · {{ detail.modelName }} · #{{ detail.authorId }}</p>
        <div class="prompt-detail-images">
          <el-image
            v-for="image in detail.images || []"
            :key="String(image.id ?? image.url)"
            :src="image.url"
            fit="cover"
            class="prompt-detail-image"
            :preview-src-list="detailImageUrls"
          />
        </div>
        <pre class="prompt-detail-content">{{ detail.content }}</pre>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="danger" @click="openReject(detail?.id)">{{ t('prompt.reject') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="confirmApprove(detail?.id)">{{ t('prompt.approve') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="rejectVisible" :title="t('prompt.reject')" width="460px" destroy-on-close>
      <el-input v-model="rejectReason" type="textarea" :rows="3" :placeholder="t('prompt.rejectReasonPlaceholder')" />
      <template #footer>
        <el-button @click="rejectVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="danger" :loading="submitting" @click="confirmReject">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { promptApi } from '@/api'
import type { PromptCategory, PromptItem } from '@/api/prompt'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const columns = computed(() => [
  { prop: 'id', label: 'ID', width: 70 },
  { prop: 'coverImage', label: t('prompt.cover'), width: 90 },
  { prop: 'title', label: t('prompt.title'), minWidth: 200, showOverflowTooltip: true },
  { prop: 'categoryName', label: t('prompt.category'), width: 120 },
  { prop: 'modelName', label: t('prompt.model'), width: 120 },
  { prop: 'authorId', label: t('prompt.userSource'), width: 110, align: 'center' },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 220, fixed: 'right' },
])

const searchFields = computed(() => [
  { prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('prompt.keywordPlaceholder') },
  {
    prop: 'categoryId',
    label: t('prompt.category'),
    type: 'select',
    placeholder: t('common.all'),
    options: () => categoryOptions.value.map((item) => ({ label: item.name, value: item.id })),
  },
])

const rows = ref<PromptItem[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive<Record<string, unknown>>({ keyword: '', categoryId: '' })
const categoryOptions = ref<PromptCategory[]>([])
const detailVisible = ref(false)
const rejectVisible = ref(false)
const submitting = ref(false)
const detail = ref<PromptItem | null>(null)
const rejectReason = ref('')
const rejectTargetId = ref<number | null>(null)

const detailImageUrls = computed(() => (detail.value?.images ?? []).map((image) => image.url))
const formatDate = (value: unknown): string => (value ? new Date(String(value)).toLocaleString() : '-')
const errorMessage = (err: unknown): string => {
  const axiosErr = err as { response?: { data?: { message?: string } } }
  return axiosErr.response?.data?.message || getErrorMessage(err)
}

const fetchRows = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await promptApi.getReviews({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
      keyword: String(searchParams.keyword || '') || undefined,
      categoryId: String(searchParams.categoryId || '') || undefined,
    })
    rows.value = res.data.rows
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(errorMessage(err))
  } finally {
    loading.value = false
  }
}

const fetchOptions = async (): Promise<void> => {
  try {
    const res = await promptApi.getCategoryOptions()
    categoryOptions.value = res.data
  } catch (err: unknown) {
    ElMessage.error(errorMessage(err))
  }
}

const onQuery = ({ pagination: next, searchParams: nextSearch }: { pagination: Record<string, number>; searchParams?: Record<string, unknown> }): void => {
  Object.assign(pagination, next)
  if (nextSearch) Object.assign(searchParams, nextSearch)
  fetchRows()
}

const openDetail = async (row: Record<string, unknown>): Promise<void> => {
  const item = row as unknown as PromptItem
  try {
    const res = await promptApi.getPrompt(item.id)
    detail.value = res.data
    detailVisible.value = true
  } catch (err: unknown) {
    ElMessage.error(errorMessage(err))
  }
}

const confirmApprove = async (id?: number): Promise<void> => {
  if (!id) return
  submitting.value = true
  try {
    await promptApi.approveReview(id)
    ElMessage.success(t('common.success'))
    detailVisible.value = false
    fetchRows()
  } catch (err: unknown) {
    ElMessage.error(errorMessage(err))
  } finally {
    submitting.value = false
  }
}

const openReject = (id?: number): void => {
  if (!id) return
  rejectTargetId.value = id
  rejectReason.value = ''
  rejectVisible.value = true
}

const confirmReject = async (): Promise<void> => {
  if (!rejectTargetId.value) return
  if (!rejectReason.value.trim()) {
    ElMessage.warning(t('prompt.rejectReasonPlaceholder'))
    return
  }
  submitting.value = true
  try {
    await promptApi.rejectReview(rejectTargetId.value, rejectReason.value.trim())
    ElMessage.success(t('common.success'))
    rejectVisible.value = false
    detailVisible.value = false
    fetchRows()
  } catch (err: unknown) {
    ElMessage.error(errorMessage(err))
  } finally {
    submitting.value = false
  }
}

const handleApprove = (row: Record<string, unknown>): void => {
  void confirmApprove((row as unknown as PromptItem).id)
}

const handleReject = (row: Record<string, unknown>): void => {
  openReject((row as unknown as PromptItem).id)
}

onMounted(() => {
  fetchRows()
  fetchOptions()
})
</script>

<style scoped>
.prompt-cover {
  width: 54px;
  height: 40px;
  border-radius: 4px;
}
.prompt-detail-title {
  margin: 0 0 4px;
}
.prompt-detail-meta {
  color: var(--el-text-color-secondary);
  margin: 0 0 12px;
}
.prompt-detail-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.prompt-detail-image {
  width: 140px;
  height: 105px;
  border-radius: 4px;
}
.prompt-detail-content {
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 4px;
  font-family: inherit;
}
</style>
