<template>
  <div class="page-container">
    <ProTable
      :title="t('notice.pageTitle')"
      :columns="columns"
      :data="list"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      column-settings-key="notice_list"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openDialog()">
          {{ t('notice.addNotice') }}
        </el-button>
      </template>

      <template #column-type="{ row }">
        <el-tag :type="row.type === 'notice' ? 'primary' : 'warning'" size="small">
          {{ row.type === 'notice' ? t('notice.notice') : t('notice.announcement') }}
        </el-tag>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="row.status === 'published' ? 'success' : 'info'" size="small">
          {{ row.status === 'published' ? t('notice.published') : t('notice.draft') }}
        </el-tag>
      </template>

      <template #column-isTop="{ row }">
        <el-tag v-if="row.isTop" type="danger" size="small">
          {{ t('notice.top') }}
        </el-tag>
      </template>

      <template #column-publishTime="{ row }">
        {{ row.publishTime ? new Date(row.publishTime).toLocaleString() : '-' }}
      </template>

      <template #column-createdAt="{ row }">
        {{ row.createdAt ? new Date(row.createdAt).toLocaleString() : '-' }}
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="primary" link size="small" :icon="Edit" @click="openDialog(row)">
            {{ t('common.edit') }}
          </el-button>
          <el-button v-if="row.status === 'draft'" type="success" link size="small" @click="handlePublish(row)">
            {{ t('notice.publish') }}
          </el-button>
          <el-button v-if="row.status === 'published'" type="warning" link size="small" @click="handleUnpublish(row)">
            {{ t('notice.unpublish') }}
          </el-button>
          <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row)">
            {{ t('common.delete') }}
          </el-button>
        </div>
      </template>
    </ProTable>

    <FormDialog
      ref="formDialogRef"
      v-model="dialogVisible"
      v-model:form="form"
      :title="isEdit ? t('notice.editNotice') : t('notice.addNotice')"
      :loading="submitLoading"
      :schema="formSchema"
      fullscreen
      @confirm="handleSubmit"
    >
      <template #content="{ modelValue, updateValue }">
        <MdEditor
          :model-value="modelValue"
          :language="locale === 'en-US' ? 'en-US' : 'zh-CN'"
          :preview="true"
          :toolbars-exclude="['github']"
          :placeholder="t('notice.inputContent')"
          style="height: calc(100vh - 280px)"
          @update:model-value="updateValue"
        />
      </template>
    </FormDialog>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { noticeApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import FormDialog from '@/components/FormDialog.vue'
import { useCrud } from '@/composables/useCrud'
import { useI18n } from '@/i18n'
import type { Notice } from '@/types/api'

// MdEditor 仅在打开新增/编辑通知对话框时渲染，动态加载避免把 md-editor chunk 拉入本页 chunk
const MdEditor = defineAsyncComponent(async () => {
  const { setupMdEditor } = await import('@/utils/mdEditorSetup')
  setupMdEditor()
  await import('md-editor-v3/lib/style.css')
  const mod = await import('md-editor-v3')
  return mod.MdEditor
})

const { t, locale } = useI18n()

const searchFields = computed(() => [
  { prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('notice.inputKeyword') },
  {
    prop: 'type',
    label: t('common.type'),
    type: 'select',
    placeholder: t('common.all'),
    options: () => [
      { label: t('notice.notice'), value: 'notice' },
      { label: t('notice.announcement'), value: 'announcement' },
    ],
  },
  {
    prop: 'status',
    label: t('common.status'),
    type: 'select',
    placeholder: t('common.all'),
    options: () => [
      { label: t('notice.published'), value: 'published' },
      { label: t('notice.draft'), value: 'draft' },
    ],
  },
])

const columns = computed(() => [
  { prop: 'index', label: t('common.index'), width: 60 },
  { prop: 'title', label: t('notice.title'), minWidth: 200, showOverflowTooltip: true },
  { prop: 'type', label: t('common.type'), width: 80, align: 'center' },
  { prop: 'status', label: t('common.status'), width: 80, align: 'center' },
  { prop: 'isTop', label: t('notice.top'), width: 60, align: 'center' },
  { prop: 'publishTime', label: t('notice.publishTime'), width: 180 },
  { prop: 'createdAt', label: t('notice.createdTime'), width: 180 },
  { prop: 'actions', label: t('common.actions'), width: 240, fixed: 'right' },
])

const defaultNoticeForm: Partial<Notice> = {
  title: '',
  type: 'notice',
  content: '',
  status: 'draft',
  isTop: false,
}

const {
  list: list,
  loading,
  pagination,
  searchParams,
  dialogVisible,
  isEdit,
  submitLoading,
  form,
  fetchData: fetchList,
  onQuery,
  handleDelete,
} = useCrud<Notice>({
  api: noticeApi,
  defaultForm: defaultNoticeForm,
  defaultSearchParams: { keyword: '', type: '', status: '' },
  defaultPagination: { pageNum: 1, pageSize: 20 },
})

const formSchema = computed(() => [
  { prop: 'title', label: t('notice.title'), type: 'input', placeholder: t('notice.inputTitle'), required: true },
  {
    prop: 'type',
    label: t('common.type'),
    type: 'radio',
    required: true,
    options: () => [
      { label: t('notice.notice'), value: 'notice' },
      { label: t('notice.announcement'), value: 'announcement' },
    ],
  },
  { prop: 'isTop', label: t('notice.top'), type: 'switch', props: { activeText: t('common.yes'), inactiveText: t('common.no') } },
  {
    prop: 'status',
    label: t('notice.publishStatus'),
    type: 'radio',
    options: () => [
      { label: t('notice.publishNow'), value: 'published' },
      { label: t('notice.saveDraft'), value: 'draft' },
    ],
  },
  { prop: 'content', label: t('notice.content'), type: 'slot' },
])

const openDialog = (row?: Record<string, unknown>) => {
  if (row) {
    isEdit.value = true
    Object.assign(form, {
      id: row.id,
      title: row.title || '',
      type: row.type || 'notice',
      content: row.content || '',
      status: row.status || 'draft',
      isTop: row.isTop || false,
    })
  } else {
    isEdit.value = false
    Object.assign(form, { title: '', type: 'notice', content: '', status: 'draft', isTop: false })
  }
  dialogVisible.value = true
}

const handleSubmit = async () => {
  submitLoading.value = true
  try {
    const payload: Partial<Notice> = { ...form }
    if (isEdit.value && form.id) {
      await noticeApi.update(form.id, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await noticeApi.create(payload)
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err) || t('common.operationFailed'))
  } finally {
    submitLoading.value = false
  }
}

const handlePublish = async (row: Record<string, unknown>) => {
  try {
    const id = row.id as number
    await noticeApi.update(id, { ...row, status: 'published', publishTime: new Date().toISOString() })
    ElMessage.success(t('notice.published'))
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(t('notice.publishFailed') + ': ' + getErrorMessage(err))
  }
}

const handleUnpublish = async (row: Record<string, unknown>) => {
  try {
    const id = row.id as number
    await noticeApi.update(id, { ...row, status: 'draft' })
    ElMessage.success(t('notice.unpublished2'))
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(t('notice.unpublishFailed') + ': ' + getErrorMessage(err))
  }
}

onMounted(fetchList)
</script>

<style lang="scss" scoped>
.table-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
