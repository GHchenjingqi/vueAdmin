<template>
  <div class="page-container">
    <el-row :gutter="12" class="prompt-stats">
      <el-col v-for="card in statCards" :key="card.label" :span="6">
        <el-card shadow="never">
          <div class="prompt-stat-label">{{ card.label }}</div>
          <div class="prompt-stat-value">{{ card.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <ProTable
      ref="tableRef"
      :key="locale"
      :title="t('prompt.manageTitle')"
      :columns="columns"
      :data="rows"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      column-settings-key="prompt_manage_list"
      show-selection
      reserve-selection
      row-key="id"
      @query="onQuery"
      @selection-change="onSelectionChange"
    >
      <template #header-buttons>
        <el-button type="danger" plain :icon="Delete" :disabled="!selectedRows.length" @click="handleBatchDelete">
          {{ t('prompt.batchDelete') }}{{ selectedRows.length ? ` (${selectedRows.length})` : '' }}
        </el-button>
        <el-button type="primary" :icon="Plus" @click="openDialog()">
          {{ t('prompt.addPrompt') }}
        </el-button>
      </template>

      <template #column-coverImage="{ row }">
        <el-image v-if="row.coverImage" :src="String(row.coverImage)" fit="cover" class="prompt-cover" :preview-src-list="[String(row.coverImage)]" />
        <span v-else>-</span>
      </template>

      <template #column-categoryName="{ row }">
        {{ row.categoryNames?.length ? row.categoryNames.join('、') : row.categoryName || '-' }}
      </template>

      <template #column-status="{ row }">
        <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
      </template>

      <template #column-source="{ row }">
        {{ row.source === 'admin' ? t('prompt.adminSource') : t('prompt.userSource') }}
      </template>

      <template #column-createdAt="{ row }">
        {{ formatDate(row.createdAt) }}
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="primary" link size="small" :icon="View" @click="openDetail(row)">{{ t('common.view') }}</el-button>
          <el-button type="warning" link size="small" :icon="Edit" @click="openDialog(row)">{{ t('common.edit') }}</el-button>
          <el-button v-if="row.status !== 'published'" type="success" link size="small" @click="handlePublish(row)">{{ t('prompt.publish') }}</el-button>
          <el-button v-else type="info" link size="small" @click="handleOffline(row)">{{ t('prompt.takeOffline') }}</el-button>
          <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row)">{{ t('common.delete') }}</el-button>
        </div>
      </template>
    </ProTable>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? t('prompt.editPrompt') : t('prompt.addPrompt')"
      width="1180px"
      top="5vh"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-row class="prompt-editor-layout">
        <el-col :span="12" class="prompt-editor-left">
          <ProForm ref="formRef" v-model="form" :schema="formSchema" :columns="2" :show-actions="false" label-width="100px">
            <template #parentId="{ modelValue, updateValue }">
              <el-select
                :model-value="modelValue as number | string | null"
                filterable
                remote
                clearable
                :remote-method="searchParentOptions"
                :loading="parentLoading"
                :placeholder="t('prompt.parentPlaceholder')"
                style="width: 100%"
                @focus="searchParentOptions()"
                @update:model-value="updateValue as (v: number | string | null) => void"
              >
                <el-option v-for="item in parentOptions" :key="item.id" :label="`#${item.id} ${item.title}`" :value="item.id" />
              </el-select>
            </template>
          </ProForm>
        </el-col>
        <el-col :span="12" class="prompt-editor-right">
          <div class="prompt-type">
            <div class="prompt-images-title">{{ t('portal.contentType') }}</div>
            <el-radio-group v-model="form.type" @change="handleTypeChange">
              <el-radio-button value="single">{{ t('portal.typeSingle') }}</el-radio-button>
              <el-radio-button value="sequence">{{ t('portal.typeSequence') }}</el-radio-button>
            </el-radio-group>
            <div class="prompt-parent-tip">{{ form.type === 'sequence' ? t('portal.typeSequenceTip') : t('portal.typeSingleTip') }}</div>
          </div>
          <div class="prompt-images">
            <SequenceStepEditor
              v-if="form.type === 'sequence'"
              :steps="form.steps"
              :character-anchor="form.characterAnchor"
              :platforms="platforms"
              :uploader="promptApi.uploadImage"
              @update:steps="form.steps = $event"
              @update:character-anchor="form.characterAnchor = $event"
            />
            <PlatformImageGroups
              v-else
              :model-value="form.platformGroups"
              :platforms="platforms"
              :title="t('prompt.images')"
              :uploader="promptApi.uploadImage"
              @update:model-value="form.platformGroups = $event"
            />
          </div>
        </el-col>
      </el-row>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button :loading="submitting" @click="handleSubmit('draft')">{{ t('prompt.saveDraft') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit('publish')">{{ t('prompt.publishNow') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" :title="t('prompt.viewDetail')" width="720px" top="6vh" destroy-on-close>
      <template v-if="detail">
        <h3 class="prompt-detail-title">{{ detail.title }}</h3>
        <p class="prompt-detail-meta">
          {{ detail.categoryNames?.length ? detail.categoryNames.join('、') : detail.categoryName }} · {{ detail.modelName }} ·
          {{ statusLabel(detail.status) }}
        </p>
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
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, View } from '@element-plus/icons-vue'
import { promptApi } from '@/api'
import type { PromptCategory, PromptImageGroupInput, PromptItem, PromptPayload, PromptPlatform, PromptStats, PromptStepInput, PromptType } from '@/api/prompt'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import ProForm from '@/components/ProForm/index.vue'
import PlatformImageGroups from '@/views/portal/components/PlatformImageGroups.vue'
import SequenceStepEditor from '@/views/portal/components/SequenceStepEditor.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const statusOptions = computed(() => [
  { label: t('prompt.draft'), value: 'draft' },
  { label: t('prompt.pending'), value: 'pending' },
  { label: t('prompt.published'), value: 'published' },
  { label: t('prompt.rejected'), value: 'rejected' },
  { label: t('prompt.offline'), value: 'offline' },
])

const statusLabel = (value: unknown): string => statusOptions.value.find((option) => option.value === value)?.label ?? String(value ?? '-')
type TagType = 'success' | 'info' | 'warning' | 'danger'
const statusType = (value: unknown): TagType => {
  const map: Record<string, TagType> = { published: 'success', pending: 'warning', rejected: 'danger', offline: 'info', draft: 'info' }
  return map[String(value)] ?? 'info'
}
const formatDate = (value: unknown): string => (value ? new Date(String(value)).toLocaleString() : '-')

const columns = computed(() => [
  { prop: 'id', label: 'ID', width: 70 },
  { prop: 'coverImage', label: t('prompt.cover'), width: 90 },
  { prop: 'title', label: t('prompt.title'), minWidth: 180, showOverflowTooltip: true },
  { prop: 'categoryName', label: t('prompt.category'), width: 150 },
  { prop: 'modelName', label: t('prompt.model'), width: 120 },
  { prop: 'status', label: t('common.status'), width: 100, align: 'center' },
  { prop: 'source', label: t('prompt.source'), width: 100, align: 'center' },
  { prop: 'viewCount', label: t('common.view'), width: 90, align: 'center' },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 340, fixed: 'right' },
])

const searchFields = computed(() => [
  { prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('prompt.keywordPlaceholder') },
  { prop: 'status', label: t('common.status'), type: 'select', placeholder: t('common.all'), options: () => statusOptions.value },
  {
    prop: 'categoryId',
    label: t('prompt.category'),
    type: 'select',
    placeholder: t('common.all'),
    options: () => categoryOptions.value.map((item) => ({ label: item.name, value: item.id })),
  },
])

interface PromptForm {
  title: string
  content: string
  categoryId: number | string
  categoryIds: Array<number | string>
  parentId: number | string | null
  modelName: string
  type: PromptType
  characterAnchor: string
  steps: PromptStepInput[]
  platformGroups: PromptImageGroupInput[]
}

const rows = ref<PromptItem[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive<Record<string, unknown>>({ keyword: '', status: '', categoryId: '' })
const categoryOptions = ref<PromptCategory[]>([])
const modelOptions = ref<string[]>([])
const platforms = ref<PromptPlatform[]>([])
const parentOptions = ref<Array<{ id: number; title: string }>>([])
const parentLoading = ref(false)
const stats = ref<PromptStats>({ total: 0, published: 0, pending: 0, offline: 0, categories: 0, favorites: 0 })
const dialogVisible = ref(false)
const detailVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const currentId = ref<number | null>(null)
const detail = ref<PromptItem | null>(null)
const formRef = ref<InstanceType<typeof ProForm> | null>(null)
const tableRef = ref<InstanceType<typeof ProTable> | null>(null)
const form = reactive<PromptForm>({
  title: '',
  content: '',
  categoryId: '',
  categoryIds: [],
  parentId: null,
  modelName: '',
  type: 'single',
  characterAnchor: '',
  steps: [],
  platformGroups: [],
})
const selectedRows = ref<PromptItem[]>([])

const detailImageUrls = computed(() => (detail.value?.images ?? []).map((image) => image.url))

const statCards = computed(() => [
  { label: t('prompt.totalPrompts'), value: stats.value.total },
  { label: t('prompt.publishedCount'), value: stats.value.published },
  { label: t('prompt.pendingCount'), value: stats.value.pending },
  { label: t('prompt.favoriteCount'), value: stats.value.favorites },
])

const formSchema = computed(() => [
  { prop: 'parentId', label: t('prompt.parentPrompt'), slot: 'parentId', span: 24 },
  { prop: 'title', label: t('prompt.title'), type: 'input', required: true, span: 24 },
  {
    prop: 'categoryIds',
    label: t('prompt.category'),
    type: 'select',
    required: true,
    multiple: true,
    options: () => categoryOptions.value.map((item) => ({ label: item.name, value: item.id })),
    props: { 'multiple-limit': 10 },
  },
  {
    prop: 'modelName',
    label: t('prompt.model'),
    type: 'select',
    required: true,
    filterable: true,
    placeholder: t('prompt.modelPlaceholder'),
    options: () => modelOptions.value.map((name) => ({ label: name, value: name })),
    props: { 'allow-create': true, 'default-first-option': true },
  },
  { prop: 'content', label: t('prompt.content'), type: 'textarea', required: true, span: 24, props: { rows: 8, autosize: false } },
])

const fetchRows = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await promptApi.getPrompts({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
      keyword: String(searchParams.keyword || '') || undefined,
      status: String(searchParams.status || '') || undefined,
      categoryId: String(searchParams.categoryId || '') || undefined,
    })
    rows.value = res.data.rows
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const fetchOptions = async (): Promise<void> => {
  const [categories, models, platformList] = await Promise.allSettled([
    promptApi.getCategoryOptions(),
    promptApi.getModelOptions(),
    promptApi.getPlatformOptions(),
  ])
  if (categories.status === 'fulfilled') {
    categoryOptions.value = categories.value.data
  } else {
    ElMessage.error(getErrorMessage(categories.reason))
  }
  // 模型选项只是便利功能，接口异常时仍可手动录入，不阻断分类加载
  if (models.status === 'fulfilled') modelOptions.value = models.value.data ?? []
  // 平台列表用于效果图按平台分组；加载失败时分组退化为默认平台
  if (platformList.status === 'fulfilled') platforms.value = platformList.value.data ?? []
}

const searchParentOptions = async (keyword = ''): Promise<void> => {
  parentLoading.value = true
  try {
    const res = await promptApi.getParentOptions({
      keyword: keyword.trim(),
      excludeId: isEdit.value && currentId.value !== null ? currentId.value : undefined,
    })
    parentOptions.value = res.data
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    parentLoading.value = false
  }
}

const fetchStats = async (): Promise<void> => {
  try {
    const res = await promptApi.getStats()
    stats.value = res.data
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  }
}

const onQuery = ({ pagination: next, searchParams: nextSearch }: { pagination: Record<string, number>; searchParams?: Record<string, unknown> }): void => {
  Object.assign(pagination, next)
  if (nextSearch) Object.assign(searchParams, nextSearch)
  fetchRows()
}

const resetForm = (): void => {
  form.title = ''
  form.content = ''
  form.categoryId = ''
  form.categoryIds = []
  form.parentId = null
  form.modelName = ''
  form.type = 'single'
  form.characterAnchor = ''
  form.steps = []
  form.platformGroups = []
}

/** 默认平台组：取第一个可用平台，异常时退化为 1（通用） */
const defaultGroup = (): PromptImageGroupInput => ({ platformId: platforms.value[0]?.id ?? 1, images: [] })

const defaultStep = (): PromptStepInput => ({
  name: '',
  actionPrompt: '',
  camera: null,
  seconds: 5,
  transition: null,
  platformGroups: [defaultGroup()],
})

/** 切换内容形态时保证对应编辑器至少有一个可编辑的组/步骤 */
const ensureTypeDefaults = (): void => {
  if (form.type === 'single') {
    if (!form.platformGroups.length) form.platformGroups = [defaultGroup()]
  } else if (!form.steps.length) {
    form.steps = [defaultStep()]
  }
}

const handleTypeChange = (): void => {
  ensureTypeDefaults()
}

/** 服务端返回图片 → 表单平台组结构；旧数据无平台分组时归入第一张图所属平台 */
const toFormGroups = (loaded: Pick<PromptItem, 'platformGroups' | 'images'>): PromptImageGroupInput[] => {
  const groups = loaded.platformGroups?.length
    ? loaded.platformGroups
    : loaded.images?.length
      ? [{ platformId: loaded.images[0].platformId || platforms.value[0]?.id || 1, images: loaded.images }]
      : []
  return groups.map((group) => ({
    platformId: group.platformId,
    images: group.images.map((image) => ({
      url: image.url,
      filePath: image.filePath ?? null,
      sort: image.sort,
      isCover: Boolean(image.isCover),
    })),
  }))
}

/** 服务端返回步骤 → 表单步骤结构 */
const toFormSteps = (loaded: PromptItem): PromptStepInput[] =>
  (loaded.steps ?? []).map((step) => ({
    id: step.id,
    stepOrder: step.stepOrder,
    name: step.name,
    actionPrompt: step.actionPrompt,
    camera: step.camera,
    seconds: step.seconds,
    transition: step.transition,
    platformGroups: (step.platformGroups ?? []).map((group) => ({
      platformId: group.platformId,
      images: group.images.map((image) => ({
        url: image.url,
        filePath: image.filePath ?? null,
        sort: image.sort,
        isCover: Boolean(image.isCover),
      })),
    })),
  }))

const openDialog = async (row?: Record<string, unknown>): Promise<void> => {
  if (!categoryOptions.value.length) await fetchOptions()
  resetForm()
  let parentTitle = ''
  if (row) {
    const item = row as unknown as PromptItem
    isEdit.value = true
    currentId.value = item.id
    try {
      const res = await promptApi.getPrompt(item.id)
      const loaded = res.data
      form.title = loaded.title
      form.content = loaded.content
      form.categoryIds = loaded.categoryIds?.length ? loaded.categoryIds : [loaded.categoryId]
      form.categoryId = form.categoryIds[0]
      form.parentId = loaded.parentId ?? null
      parentTitle = loaded.parentTitle ?? ''
      form.modelName = loaded.modelName
      form.type = loaded.type === 'sequence' ? 'sequence' : 'single'
      form.characterAnchor = loaded.characterAnchor || ''
      if (form.type === 'sequence') {
        form.steps = toFormSteps(loaded)
        form.platformGroups = []
      } else {
        form.platformGroups = toFormGroups(loaded)
        form.steps = []
      }
    } catch (err: unknown) {
      ElMessage.error(getErrorMessage(err))
      return
    }
  } else {
    isEdit.value = false
    currentId.value = null
    ensureTypeDefaults()
  }
  await searchParentOptions()
  // 编辑时若当前关联项不在默认列表里（如标题变化），补上以保证回显可读
  if (form.parentId && parentTitle && !parentOptions.value.some((item) => item.id === Number(form.parentId))) {
    parentOptions.value.unshift({ id: Number(form.parentId), title: parentTitle })
  }
  dialogVisible.value = true
}

const submitImagesTotal = (): number => {
  if (form.type === 'sequence') {
    return form.steps.reduce((sum, step) => sum + step.platformGroups.reduce((sub, group) => sub + group.images.length, 0), 0)
  }
  return form.platformGroups.reduce((sum, group) => sum + group.images.length, 0)
}

/** 提交前校验：规则与前台投稿页 PublishPrompt 保持一致 */
const validateForm = (action: 'publish' | 'draft'): boolean => {
  if (form.type === 'sequence') {
    if (form.steps.length === 0) {
      ElMessage.warning(t('portal.stepRequired'))
      return false
    }
    for (const [index, step] of form.steps.entries()) {
      if (!step.name.trim() || !step.actionPrompt.trim()) {
        ElMessage.warning(t('portal.stepFieldRequired').replace('{n}', String(index + 1)))
        return false
      }
      if (step.platformGroups.some((group) => group.images.length > 1)) {
        ElMessage.warning(t('portal.stepImageLimit'))
        return false
      }
      if (new Set(step.platformGroups.map((group) => group.platformId)).size !== step.platformGroups.length) {
        ElMessage.warning(t('portal.platformDuplicate'))
        return false
      }
    }
  } else {
    if (new Set(form.platformGroups.map((group) => group.platformId)).size !== form.platformGroups.length) {
      ElMessage.warning(t('portal.platformDuplicate'))
      return false
    }
  }
  if (action === 'publish' && submitImagesTotal() === 0) {
    ElMessage.warning(t('portal.imageRequired'))
    return false
  }
  return true
}

const buildPayload = (action: 'publish' | 'draft'): PromptPayload => {
  const categoryIds = form.categoryIds.map(Number)
  const isSequence = form.type === 'sequence'
  return {
    title: form.title,
    content: form.content,
    categoryId: categoryIds[0] ?? Number(form.categoryId),
    categoryIds,
    parentId: form.parentId === null || form.parentId === '' ? null : Number(form.parentId),
    modelName: form.modelName,
    type: form.type,
    characterAnchor: isSequence ? form.characterAnchor.trim() || null : null,
    steps: isSequence
      ? form.steps.map((step, index) => ({
          ...(step.id ? { id: step.id } : {}),
          stepOrder: index + 1,
          name: step.name.trim(),
          actionPrompt: step.actionPrompt.trim(),
          camera: step.camera?.trim() || null,
          seconds: step.seconds,
          transition: step.transition?.trim() || null,
          platformGroups: step.platformGroups
            .filter((group) => group.images.length > 0)
            .map((group) => ({
              platformId: Number(group.platformId),
              images: group.images.map((image) => ({
                url: image.url,
                filePath: image.filePath ?? null,
                sort: image.sort,
                isCover: Boolean(image.isCover),
              })),
            })),
        }))
      : undefined,
    action,
    platformGroups: isSequence
      ? undefined
      : form.platformGroups
          .filter((group) => group.images.length > 0)
          .map((group) => ({
            platformId: Number(group.platformId),
            images: group.images.map((image, index) => ({
              url: image.url,
              filePath: image.filePath ?? null,
              sort: index,
              isCover: Boolean(image.isCover),
            })),
          })),
  }
}

const handleSubmit = async (action: 'publish' | 'draft'): Promise<void> => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!validateForm(action)) return
  submitting.value = true
  try {
    const payload = buildPayload(action)
    if (isEdit.value && currentId.value !== null) await promptApi.updatePrompt(currentId.value, payload)
    else await promptApi.createPrompt(payload)
    ElMessage.success(t('common.success'))
    dialogVisible.value = false
    fetchRows()
    fetchStats()
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err))
  } finally {
    submitting.value = false
  }
}

const openDetail = async (row: Record<string, unknown>): Promise<void> => {
  const item = row as unknown as PromptItem
  try {
    const res = await promptApi.getPrompt(item.id)
    detail.value = res.data
    detailVisible.value = true
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  }
}

const handlePublish = async (row: Record<string, unknown>): Promise<void> => {
  const item = row as unknown as PromptItem
  try {
    await promptApi.publishPrompt(item.id)
    ElMessage.success(t('common.success'))
    fetchRows()
    fetchStats()
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err))
  }
}

const handleOffline = async (row: Record<string, unknown>): Promise<void> => {
  const item = row as unknown as PromptItem
  try {
    await promptApi.offlinePrompt(item.id)
    ElMessage.success(t('common.success'))
    fetchRows()
    fetchStats()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  }
}

const onSelectionChange = (selection: unknown[]): void => {
  selectedRows.value = selection as PromptItem[]
}

const handleBatchDelete = (): void => {
  const ids = selectedRows.value.map((row) => row.id)
  if (!ids.length) {
    ElMessage.warning(t('prompt.selectFirst'))
    return
  }
  ElMessageBox.confirm(t('prompt.batchDeleteConfirm', { count: ids.length }), t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        const res = await promptApi.batchDeletePrompts(ids)
        ElMessage.success(t('prompt.batchDeleteSuccess', { count: res.data?.deleted ?? ids.length }))
        selectedRows.value = []
        tableRef.value?.clearSelection()
        fetchRows()
        fetchStats()
      } catch (err: unknown) {
        ElMessage.error(getErrorMessage(err))
      }
    })
    .catch(() => undefined)
}

const handleDelete = (row: Record<string, unknown>): void => {
  const item = row as unknown as PromptItem
  ElMessageBox.confirm(`${t('prompt.deleteConfirm')}「${item.title}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await promptApi.deletePrompt(item.id)
        ElMessage.success(t('common.success'))
        fetchRows()
        fetchStats()
      } catch (err: unknown) {
        ElMessage.error(getErrorMessage(err))
      }
    })
    .catch(() => undefined)
}

onMounted(() => {
  fetchRows()
  fetchOptions()
  fetchStats()
})
</script>

<style scoped>
.prompt-stats {
  margin-bottom: 12px;
}
.prompt-stat-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.prompt-stat-value {
  font-size: 24px;
  font-weight: 600;
  margin-top: 4px;
}
.prompt-cover {
  width: 54px;
  height: 40px;
  border-radius: 4px;
}
.prompt-editor-layout {
  align-items: stretch;
}
.prompt-editor-left {
  padding-right: 20px;
  border-right: 1px solid var(--el-border-color-lighter);
}
.prompt-editor-right {
  padding-left: 20px;
}
.prompt-parent-tip {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.prompt-type {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}
.prompt-images {
  margin-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
}
.prompt-images-title {
  font-weight: 600;
  margin-bottom: 8px;
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
