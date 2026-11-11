<template>
  <div class="page-container">
    <el-tabs v-model="activeTab" class="moderation-tabs" @tab-change="onTabChange">
      <el-tab-pane :label="t('shop.reviews.title')" name="reviews" />
      <el-tab-pane :label="t('shop.qa.title')" name="qa" />
    </el-tabs>

    <ProTable
      :key="locale + '-' + activeTab"
      :title="t(activeTab === 'reviews' ? 'shop.reviews.title' : 'shop.qa.title')"
      :columns="columns"
      :data="rows"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      @query="onQuery"
    >
      <template #column-status="{ row }">
        <el-tag :type="statusTag((row as ReviewItem | QaItem).status)" size="small" disable-transitions>
          {{ statusLabel((row as ReviewItem | QaItem).status) }}
        </el-tag>
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="info" link size="small" :icon="View" @click="openDetail(row as ReviewItem | QaItem)">
            {{ t('common.detail') }}
          </el-button>
          <template v-if="activeTab === 'reviews'">
            <el-button v-if="(row as ReviewItem).status === 'pending'" type="success" link size="small" @click="handleApproveReview(row as ReviewItem)">
              {{ t('shop.reviews.approve') }}
            </el-button>
            <el-button v-if="(row as ReviewItem).status === 'pending'" type="danger" link size="small" @click="handleRejectReview(row as ReviewItem)">
              {{ t('shop.reviews.reject') }}
            </el-button>
          </template>
          <template v-else>
            <el-button v-if="(row as QaItem).status === 'pending'" type="success" link size="small" @click="openAnswer(row as QaItem)">
              {{ t('shop.qa.answerBtn') }}
            </el-button>
            <el-button v-if="(row as QaItem).status !== 'hidden'" type="warning" link size="small" @click="handleHide(row as QaItem)">
              {{ t('shop.qa.hide') }}
            </el-button>
          </template>
        </div>
      </template>
    </ProTable>

    <!-- 详情 -->
    <el-dialog
      v-model="detailVisible"
      :title="t(activeTab === 'reviews' ? 'shop.reviews.detail' : 'shop.qa.detail')"
      width="720px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-descriptions v-if="current" :column="2" border>
        <el-descriptions-item :label="t('common.id')">{{ current?.id }}</el-descriptions-item>
        <el-descriptions-item :label="t('shop.reviews.spuId')">{{ current?.spuId }}</el-descriptions-item>
        <el-descriptions-item :label="t('common.status')">
          <el-tag :type="statusTag(current?.status as AnyStatus)" size="small" disable-transitions>{{ statusLabel(current?.status as AnyStatus) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.createdTime')">{{ formatTime(current?.createdAt) }}</el-descriptions-item>

        <template v-if="activeTab === 'reviews'">
          <el-descriptions-item :label="t('shop.reviews.rating')">
            <el-rate :model-value="reviewCurrent?.rating ?? 0" disabled />
          </el-descriptions-item>
          <el-descriptions-item :label="t('shop.reviews.verified')">
            {{ reviewCurrent?.verified ? t('shop.reviews.yes') : t('shop.reviews.no') }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('shop.reviews.anonymous')">
            {{ reviewCurrent?.isAnonymous ? t('shop.reviews.yes') : t('shop.reviews.no') }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('shop.reviews.helpful')">{{ reviewCurrent?.helpfulCount ?? 0 }}</el-descriptions-item>
          <el-descriptions-item :label="t('shop.reviews.titleCol')" :span="2">{{ reviewCurrent?.title || '-' }}</el-descriptions-item>
          <el-descriptions-item :label="t('shop.reviews.content')" :span="2">{{ reviewCurrent?.content }}</el-descriptions-item>
          <el-descriptions-item v-if="reviewCurrent?.images?.length" :label="t('shop.reviews.images')" :span="2">
            <div class="review-imgs">
              <img v-for="(img, i) in reviewCurrent?.images ?? []" :key="i" :src="img" class="review-img" alt="review" />
            </div>
          </el-descriptions-item>
        </template>

        <template v-else>
          <el-descriptions-item :label="t('shop.qa.question')" :span="2">{{ qaCurrent?.question }}</el-descriptions-item>
          <el-descriptions-item :label="t('shop.qa.answer')" :span="2">{{ qaCurrent?.answer || '-' }}</el-descriptions-item>
          <el-descriptions-item :label="t('shop.qa.answeredBy')">{{ qaCurrent?.answeredBy || '-' }}</el-descriptions-item>
          <el-descriptions-item :label="t('shop.qa.answeredAt')">{{ formatTime(qaCurrent?.answeredAt) }}</el-descriptions-item>
        </template>
      </el-descriptions>

      <template #footer>
        <el-button @click="detailVisible = false">{{ t('common.close') }}</el-button>
        <el-button
          v-if="activeTab === 'reviews' && (current as ReviewItem | null)?.status === 'pending'"
          type="success"
          :loading="submitLoading"
          @click="handleApproveReview(current as ReviewItem)"
        >
          {{ t('shop.reviews.approve') }}
        </el-button>
        <el-button
          v-if="activeTab === 'reviews' && (current as ReviewItem | null)?.status === 'pending'"
          type="danger"
          :loading="submitLoading"
          @click="handleRejectReview(current as ReviewItem)"
        >
          {{ t('shop.reviews.reject') }}
        </el-button>
        <el-button
          v-if="activeTab === 'qa' && (current as QaItem | null)?.status === 'pending'"
          type="success"
          :loading="submitLoading"
          @click="openAnswer(current as QaItem)"
        >
          {{ t('shop.qa.answerBtn') }}
        </el-button>
        <el-button
          v-if="activeTab === 'qa' && (current as QaItem | null)?.status !== 'hidden'"
          type="warning"
          :loading="submitLoading"
          @click="handleHide(current as QaItem)"
        >
          {{ t('shop.qa.hide') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 回答提问 -->
    <el-dialog v-model="answerVisible" :title="t('shop.qa.answerTitle')" width="460px" :close-on-click-modal="false" destroy-on-close>
      <el-form ref="answerFormRef" :model="answerForm" label-width="80px">
        <el-form-item :label="t('shop.qa.answer')" required>
          <el-input v-model="answerForm.answer" type="textarea" :rows="4" :placeholder="t('shop.qa.answerPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="answerVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="success" :loading="submitLoading" @click="handleAnswer">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { View } from '@element-plus/icons-vue'
import { shopReviewApi, type ReviewItem, type QaItem, type ReviewStatus, type QaStatus } from '@/api/shopReview'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

type AnyItem = ReviewItem | QaItem
type AnyStatus = ReviewStatus | QaStatus

const statusLabel = (status: AnyStatus): string => {
  switch (status) {
    case 'pending':
      return t('shop.reviews.statusPending')
    case 'approved':
      return t('shop.reviews.statusApproved')
    case 'rejected':
      return t('shop.reviews.statusRejected')
    case 'answered':
      return t('shop.qa.statusAnswered')
    case 'hidden':
      return t('shop.qa.statusHidden')
    default:
      return status
  }
}

const statusTag = (status: AnyStatus): 'success' | 'warning' | 'info' | 'danger' | 'primary' => {
  const map: Record<AnyStatus, 'success' | 'warning' | 'info' | 'danger' | 'primary'> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
    answered: 'success',
    hidden: 'info',
  }
  return map[status] ?? 'info'
}

const formatTime = (value: string | null | undefined): string => {
  if (!value) return '-'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString()
}

const activeTab = ref<'reviews' | 'qa'>('reviews')

const reviewColumns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'spuId', label: t('shop.reviews.spuId'), width: 110 },
  { prop: 'rating', label: t('shop.reviews.rating'), width: 140 },
  { prop: 'title', label: t('shop.reviews.titleCol'), minWidth: 140 },
  { prop: 'status', label: t('common.status'), width: 100 },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 220, fixed: 'right' },
])

const qaColumns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'spuId', label: t('shop.qa.spuId'), width: 110 },
  { prop: 'question', label: t('shop.qa.question'), minWidth: 200 },
  { prop: 'status', label: t('common.status'), width: 100 },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 220, fixed: 'right' },
])

const columns = computed(() => (activeTab.value === 'reviews' ? reviewColumns.value : qaColumns.value))

const rows = ref<AnyItem[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive({ status: '' as AnyStatus | '', spuId: '' as string | number })

const reviewStatusOptions: ReviewStatus[] = ['pending', 'approved', 'rejected']
const qaStatusOptions: QaStatus[] = ['pending', 'answered', 'hidden']

const searchFields = computed(() => [
  {
    prop: 'status',
    label: t('common.status'),
    type: 'select',
    placeholder: t('common.all'),
    options: (activeTab.value === 'reviews' ? reviewStatusOptions : qaStatusOptions).map((s) => ({ label: statusLabel(s), value: s })),
  },
  { prop: 'spuId', label: t('shop.reviews.spuId'), type: 'input', placeholder: t('shop.reviews.spuIdPlaceholder') },
])

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const spuId = searchParams.spuId ? Number(searchParams.spuId) : undefined
    const limit = pagination.pageSize
    const offset = (pagination.pageNum - 1) * pagination.pageSize
    const res =
      activeTab.value === 'reviews'
        ? await shopReviewApi.listReviews({
            status: (searchParams.status || undefined) as ReviewStatus | '' | undefined,
            spuId,
            limit,
            offset,
          })
        : await shopReviewApi.listQuestions({
            status: (searchParams.status || undefined) as QaStatus | '' | undefined,
            spuId,
            limit,
            offset,
          })
    rows.value = res.data.rows as AnyItem[]
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error((activeTab.value === 'reviews' ? t('shop.reviews.fetchFailed') : t('shop.qa.fetchFailed')) + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const onTabChange = (): void => {
  pagination.pageNum = 1
  fetchList()
}

const onQuery = ({ pagination: p, searchParams: s }: { pagination: Record<string, number>; searchParams?: Record<string, unknown> }): void => {
  Object.assign(pagination, p)
  if (s) Object.assign(searchParams, s)
  fetchList()
}

// ==================== 详情 ====================
const detailVisible = ref(false)
const current = ref<AnyItem | null>(null)

const reviewCurrent = computed(() => current.value as ReviewItem | null)
const qaCurrent = computed(() => current.value as QaItem | null)

const openDetail = (row: AnyItem): void => {
  current.value = row
  detailVisible.value = true
}

// ==================== 评价：通过 / 驳回 ====================
const submitLoading = ref(false)

const handleApproveReview = async (row: ReviewItem): Promise<void> => {
  submitLoading.value = true
  try {
    await shopReviewApi.approveReview(row.id)
    ElMessage.success(t('common.operationSuccess'))
    detailVisible.value = false
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitLoading.value = false
  }
}

const handleRejectReview = async (row: ReviewItem): Promise<void> => {
  try {
    await ElMessageBox.confirm(t('shop.reviews.rejectConfirm'), t('common.warning'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
    })
  } catch {
    return
  }
  submitLoading.value = true
  try {
    await shopReviewApi.rejectReview(row.id)
    ElMessage.success(t('common.operationSuccess'))
    detailVisible.value = false
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitLoading.value = false
  }
}

// ==================== 问答：回答 / 隐藏 ====================
const answerVisible = ref(false)
const answerForm = reactive({ answer: '' })
const answerTargetId = ref<number | null>(null)

const openAnswer = (row: QaItem): void => {
  answerTargetId.value = row.id
  answerForm.answer = ''
  answerVisible.value = true
}

const handleAnswer = async (): Promise<void> => {
  if (answerTargetId.value == null) return
  if (!answerForm.answer.trim()) {
    ElMessage.warning(t('shop.qa.answerRequired'))
    return
  }
  submitLoading.value = true
  try {
    await shopReviewApi.answerQuestion(answerTargetId.value, answerForm.answer.trim())
    ElMessage.success(t('common.operationSuccess'))
    answerVisible.value = false
    detailVisible.value = false
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitLoading.value = false
  }
}

const handleHide = async (row: QaItem): Promise<void> => {
  try {
    await ElMessageBox.confirm(t('shop.qa.hideConfirm'), t('common.warning'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
    })
  } catch {
    return
  }
  submitLoading.value = true
  try {
    await shopReviewApi.hideQuestion(row.id)
    ElMessage.success(t('common.operationSuccess'))
    detailVisible.value = false
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitLoading.value = false
  }
}

onMounted(fetchList)
</script>

<style scoped>
.moderation-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}
.review-imgs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.review-img {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--el-border-color-lighter);
}
</style>
