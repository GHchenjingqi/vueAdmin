<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('shop.product.title')"
      :columns="columns"
      :data="spus"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="router.push('/shop-product-edit')">
          {{ t('shop.product.add') }}
        </el-button>
      </template>

      <template #column-name="{ row }">
        <span>{{ displayName(row.name) }}</span>
      </template>

      <template #column-cover="{ row }">
        <el-image v-if="row.cover" :src="row.cover" :preview-src-list="[row.cover]" fit="cover" preview-teleported class="spu-cover" />
        <span v-else>-</span>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="statusTagType(row.status)" size="small">
          {{ t(`shop.status.${row.status}`) }}
        </el-tag>
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="primary" link size="small" :icon="Edit" @click="router.push(`/shop-product-edit?id=${row.id}`)">
            {{ t('common.edit') }}
          </el-button>
          <el-button v-for="act in statusActionsFor(row.status)" :key="act.action" :type="act.type" link size="small" @click="handleStatusAction(row, act)">
            {{ t(act.labelKey) }}
          </el-button>
          <el-button v-if="row.status === 'draft'" type="success" link size="small" @click="handleSubmitForPublish(row)">
            {{ t('shop.publish.submitReview') }}
          </el-button>
          <el-button v-if="row.status === 'published'" type="warning" link size="small" @click="openPublishDialog(row)">
            {{ t('shop.publish.title') }}
          </el-button>
          <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row)">
            {{ t('common.delete') }}
          </el-button>
        </div>
      </template>
    </ProTable>

    <PublishDialog v-model="publishVisible" :spu-id="publishSpuId" @published="fetchList" />
  </div>
</template>

<script setup lang="ts">
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { publishApi, spuApi, type Spu, type ShopStatus, type StatusAction } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import PublishDialog from './PublishDialog.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()
const router = useRouter()

interface StatusActionItem {
  action: StatusAction
  labelKey: string
  type: TagType
  needReason?: boolean
}

/** 状态 → 可执行动作（与后端 spuStatusTransitions 对齐） */
const statusActions: Record<ShopStatus, StatusActionItem[]> = {
  draft: [
    { action: 'submit', labelKey: 'shop.product.submitReview', type: 'primary' },
    { action: 'archive', labelKey: 'shop.product.archive', type: 'info' },
  ],
  review: [
    { action: 'list', labelKey: 'shop.product.approve', type: 'success' },
    { action: 'reject', labelKey: 'shop.product.reject', type: 'danger', needReason: true },
    { action: 'withdraw', labelKey: 'shop.product.withdraw', type: 'info' },
  ],
  rejected: [
    { action: 'withdraw', labelKey: 'shop.product.toDraft', type: 'warning' },
    { action: 'archive', labelKey: 'shop.product.archive', type: 'info' },
  ],
  listed: [
    { action: 'publish', labelKey: 'shop.product.publish', type: 'success' },
    { action: 'unlist', labelKey: 'shop.product.unlist', type: 'warning' },
    { action: 'archive', labelKey: 'shop.product.archive', type: 'info' },
  ],
  published: [
    { action: 'unlist', labelKey: 'shop.product.unlist', type: 'warning' },
    { action: 'archive', labelKey: 'shop.product.archive', type: 'info' },
  ],
  unlisted: [
    { action: 'list', labelKey: 'shop.product.relist', type: 'primary' },
    { action: 'archive', labelKey: 'shop.product.archive', type: 'info' },
  ],
  archived: [],
}

function statusActionsFor(status: ShopStatus): StatusActionItem[] {
  return statusActions[status] || []
}

type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'

function statusTagType(status: ShopStatus): TagType {
  const map: Record<ShopStatus, TagType> = {
    draft: 'info',
    review: 'warning',
    rejected: 'danger',
    listed: 'primary',
    published: 'success',
    unlisted: 'warning',
    archived: 'info',
  }
  return map[status]
}

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'cover', label: t('shop.product.cover'), width: 90 },
  { prop: 'name', label: t('shop.product.name'), minWidth: 200 },
  { prop: 'status', label: t('shop.product.status'), width: 100, align: 'center' },
  { prop: 'updatedAt', label: t('common.updatedTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 300, fixed: 'right' },
])

const spus = ref<Spu[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive({ keyword: '', status: '' })
const searchFields = computed(() => [
  { prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('shop.product.searchPlaceholder') },
  {
    prop: 'status',
    label: t('shop.product.status'),
    type: 'select',
    options: (['draft', 'review', 'rejected', 'listed', 'published', 'unlisted', 'archived'] as ShopStatus[]).map((s) => ({
      label: t(`shop.status.${s}`),
      value: s,
    })),
  },
])

function displayName(name: Record<string, string>): string {
  return name[locale.value] || name['zh-CN'] || Object.values(name)[0] || '-'
}

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await spuApi.list({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
      keyword: searchParams.keyword || undefined,
      status: (searchParams.status || undefined) as ShopStatus | undefined,
    })
    spus.value = res.data.list
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('shop.product.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const onQuery = ({ pagination: p, searchParams: s }: { pagination: Record<string, number>; searchParams?: Record<string, unknown> }): void => {
  Object.assign(pagination, p)
  if (s) Object.assign(searchParams, s)
  fetchList()
}

const handleStatusAction = (row: Record<string, unknown>, act: StatusActionItem): void => {
  const spu = row as unknown as Spu
  const run = async (reason?: string): Promise<void> => {
    try {
      await spuApi.changeStatus(spu.id, act.action, reason)
      ElMessage.success(t('common.operationSuccess'))
      fetchList()
    } catch (err: unknown) {
      ElMessage.error(getErrorMessage(err))
    }
  }
  if (act.needReason) {
    ElMessageBox.prompt(t('shop.product.rejectReasonPlaceholder'), t('shop.product.reject'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      inputPattern: /\S+/,
      inputErrorMessage: t('shop.product.rejectReasonRequired'),
    })
      .then(({ value }) => run(value))
      .catch(() => {
        // 用户取消
      })
  } else {
    run()
  }
}

/** 提交发布审核（走工作流审批流，合规卡点由后端校验） */
const handleSubmitForPublish = async (row: Record<string, unknown>): Promise<void> => {
  try {
    await publishApi.submitForPublish(row.id as number)
    ElMessage.success(t('shop.publish.submitSuccess'))
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  }
}

/** 发布到渠道 */
const publishVisible = ref(false)
const publishSpuId = ref<number | null>(null)

const openPublishDialog = (row: Record<string, unknown>): void => {
  publishSpuId.value = row.id as number
  publishVisible.value = true
}

const handleDelete = (row: Record<string, unknown>): void => {
  ElMessageBox.confirm(`${t('shop.product.deleteConfirm')}「${displayName(row.name as Record<string, string>)}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await spuApi.remove(row.id as number)
        ElMessage.success(t('messages.deleteSuccess'))
        fetchList()
      } catch (err: unknown) {
        ElMessage.error(getErrorMessage(err))
      }
    })
    .catch(() => {
      // 用户取消
    })
}

onMounted(fetchList)
</script>

<style lang="scss" scoped>
.spu-cover {
  width: 48px;
  height: 48px;
  border-radius: 4px;
}
</style>
