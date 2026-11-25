<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('skill.manageTitle')"
      :columns="columns"
      :data="rows"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      column-settings-key="skill_upload_list"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openDialog()">{{ t('skill.add') }}</el-button>
      </template>

      <template #column-title="{ row }">
        <span class="skill-title">{{ row.title }}</span>
      </template>

      <template #column-attachments="{ row }">
        <el-tag size="small" type="info">
          {{ t('skill.attachmentCount', { n: row.attachments?.length ?? 0 }) }}
        </el-tag>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
          {{ row.status === 1 ? t('common.enable') : t('common.disable') }}
        </el-tag>
      </template>

      <template #column-createdAt="{ row }">
        {{ formatDate(row.createdAt) }}
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="warning" link size="small" :icon="Edit" @click="openDialog(row as unknown as SkillItem)">{{ t('common.edit') }}</el-button>
          <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row as unknown as SkillItem)">{{ t('common.delete') }}</el-button>
        </div>
      </template>
    </ProTable>

    <el-dialog v-model="dialogVisible" :title="isEdit ? t('skill.edit') : t('skill.add')" width="640px" :close-on-click-modal="false" destroy-on-close>
      <el-form :model="form" label-width="90px">
        <el-form-item :label="t('skill.title')" required>
          <el-input v-model="form.title" :placeholder="t('skill.titlePlaceholder')" maxlength="120" show-word-limit />
        </el-form-item>
        <el-form-item :label="t('skill.description')">
          <el-input v-model="form.description" type="textarea" :rows="5" :placeholder="t('skill.descriptionPlaceholder')" maxlength="2000" show-word-limit />
        </el-form-item>
        <el-form-item :label="t('skill.attachments')" required>
          <div class="skill-upload-wrap">
            <el-upload
              v-model:file-list="fileList"
              class="skill-uploader"
              drag
              multiple
              :limit="20"
              :auto-upload="true"
              :http-request="handleUpload"
              :before-upload="beforeUpload"
              :on-exceed="() => ElMessage.warning(t('skill.fileLimit'))"
            >
              <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
              <div class="el-upload__text">{{ t('skill.uploadHint') }}</div>
              <template #tip>
                <div class="el-upload__tip">{{ t('skill.uploadTip') }}</div>
              </template>
            </el-upload>
            <ul v-if="attachments.length" class="skill-file-list">
              <li v-for="(file, index) in attachments" :key="file.id + '-' + index">
                <span class="skill-file-name">{{ file.name }}</span>
                <span class="skill-file-size">{{ formatSize(file.size) }}</span>
                <el-button link type="danger" size="small" @click="removeAttachment(index)">{{ t('common.delete') }}</el-button>
              </li>
            </ul>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type UploadRequestOptions, type UploadUserFile } from 'element-plus'
import { Plus, Edit, Delete, UploadFilled } from '@element-plus/icons-vue'
import { skillApi, type SkillAttachment, type SkillItem } from '@/api/skill'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const columns = computed(() => [
  { prop: 'id', label: 'ID', width: 70 },
  { prop: 'title', label: t('skill.title'), minWidth: 180 },
  { prop: 'description', label: t('skill.description'), minWidth: 220 },
  { prop: 'attachments', label: t('skill.attachments'), width: 110, align: 'center' },
  { prop: 'status', label: t('common.status'), width: 90, align: 'center' },
  { prop: 'viewCount', label: t('portal.viewCount'), width: 90, align: 'center' },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 130, fixed: 'right' },
])

const searchFields = computed(() => [{ prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('skill.searchPlaceholder') }])

const rows = ref<SkillItem[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive<Record<string, unknown>>({ keyword: '' })
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const currentId = ref<number | null>(null)
const form = reactive({ title: '', description: '' })
const attachments = ref<SkillAttachment[]>([])
const fileList = ref<UploadUserFile[]>([])

const formatDate = (value: unknown): string => (value ? new Date(String(value)).toLocaleString() : '-')
const formatSize = (bytes: number): string => {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const fetchRows = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await skillApi.getSkills({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
      keyword: String(searchParams.keyword || '') || undefined,
    })
    rows.value = res.data.rows
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const onQuery = ({ pagination: next, searchParams: nextSearch }: { pagination: Record<string, number>; searchParams?: Record<string, unknown> }): void => {
  Object.assign(pagination, next)
  if (nextSearch) Object.assign(searchParams, nextSearch)
  fetchRows()
}

const beforeUpload = (file: File): boolean => {
  if (file.size > 50 * 1024 * 1024) {
    ElMessage.error(t('skill.fileTooLarge'))
    return false
  }
  return true
}

const handleUpload = async (options: UploadRequestOptions): Promise<void> => {
  try {
    const res = await skillApi.uploadAttachment(options.file)
    attachments.value.push(res.data)
    options.onSuccess(res.data)
  } catch (err: unknown) {
    options.onError(err as Parameters<typeof options.onError>[0])
    ElMessage.error(getErrorMessage(err))
  }
}

const removeAttachment = (index: number): void => {
  attachments.value.splice(index, 1)
  fileList.value.splice(index, 1)
}

const openDialog = (row?: SkillItem): void => {
  if (row) {
    isEdit.value = true
    currentId.value = row.id
    form.title = row.title
    form.description = row.description || ''
    attachments.value = (row.attachments || []).map((item) => ({ ...item }))
  } else {
    isEdit.value = false
    currentId.value = null
    form.title = ''
    form.description = ''
    attachments.value = []
  }
  fileList.value = attachments.value.map((item, index) => ({ name: item.name, url: item.url, uid: index + 1, status: 'success' as const }))
  dialogVisible.value = true
}

const handleSubmit = async (): Promise<void> => {
  const title = form.title.trim()
  if (!title) {
    ElMessage.warning(t('skill.titleRequired'))
    return
  }
  if (!attachments.value.length) {
    ElMessage.warning(t('skill.attachmentRequired'))
    return
  }
  submitting.value = true
  try {
    const payload = { title, description: form.description.trim(), attachments: attachments.value }
    if (isEdit.value && currentId.value !== null) await skillApi.updateSkill(currentId.value, payload)
    else await skillApi.createSkill(payload)
    ElMessage.success(t('common.success'))
    dialogVisible.value = false
    fetchRows()
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err))
  } finally {
    submitting.value = false
  }
}

const handleDelete = (row: SkillItem): void => {
  ElMessageBox.confirm(`${t('skill.deleteConfirm')}「${row.title}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await skillApi.deleteSkill(row.id)
        ElMessage.success(t('common.success'))
        fetchRows()
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: string } } }
        ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err))
      }
    })
    .catch(() => undefined)
}

onMounted(fetchRows)
</script>

<style scoped>
.skill-title {
  font-weight: 600;
}
.skill-upload-wrap {
  width: 100%;
}
.skill-uploader :deep(.el-upload) {
  display: block;
}
.skill-uploader :deep(.el-upload-dragger) {
  padding: 12px;
}
.skill-file-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  max-height: 180px;
  overflow-y: auto;
}
.skill-file-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
}
.skill-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skill-file-size {
  color: var(--el-text-color-secondary);
}
</style>
