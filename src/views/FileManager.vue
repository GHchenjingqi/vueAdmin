<template>
  <div class="page-container">
    <ProTable
      :title="t('file.title')"
      :columns="columns"
      :data="filteredFiles"
      :loading="loading"
      :show-pagination="false"
      :pagination="{ pageNum: 1, pageSize: 10, total: 0 }"
      :search-params="searchParams"
      :search-fields="searchFields"
      :show-selection="true"
      :row-key="'id'"
      column-settings-key="file_list"
      @selection-change="handleSelectionChange"
      @query="onQuery"
    >
      <template #header-buttons>
        <input ref="fileInputRef" type="file" style="display: none" accept="*/*" @change="handleFileSelect" />
        <el-button type="primary" :icon="Upload" :loading="uploading" @click="triggerUpload">
          {{ t('file.uploadFile') }}
        </el-button>
      </template>

      <template #column-preview="{ row }">
        <el-image
          v-if="isImage(row.ext)"
          :src="previewUrl(row.url)"
          fit="cover"
          style="width: 40px; height: 40px; border-radius: 4px"
          :preview-src-list="[previewUrl(row.url)]"
          preview-teleported
        />
        <MenuIcon v-else :name="fileIcon(row.ext)" :size="28" :color="fileIconColor(row.ext)" />
      </template>

      <template #column-name="{ row }">
        <a :href="previewUrl(row.url)" target="_blank" style="color: var(--text-primary); text-decoration: none">
          {{ row.name }}
        </a>
      </template>

      <template #column-size="{ row }">
        {{ formatSize(row.size) }}
      </template>

      <template #column-ext="{ row }">
        <el-tag :type="fileTagType(row.ext)" size="small">
          {{ (row.ext || '').replace('.', '') || t('file.unknown') }}
        </el-tag>
      </template>

      <template #column-mtime="{ row }">
        {{ formatTime(row.mtime) }}
      </template>

      <template #column-actions="{ row }">
        <el-button type="primary" link size="small" @click="copyUrl(row.url)">
          <el-icon><Link /></el-icon>
          {{ t('file.copyLink') }}
        </el-button>
        <el-button type="danger" link size="small" @click="handleDelete(row)">
          <el-icon><Delete /></el-icon>
          {{ t('common.delete') }}
        </el-button>
      </template>
    </ProTable>

    <div v-if="selectedIds.length > 0" class="batch-bar">
      <span>{{ t('file.selected') }} {{ selectedIds.length }} {{ t('file.items') }}</span>
      <el-button type="danger" size="small" :icon="Delete" @click="handleBatchDelete">
        {{ t('file.batchDelete') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, Delete, Link } from '@element-plus/icons-vue'
import MenuIcon from '@/components/MenuIcon.vue'
import { uploadApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t } = useI18n()

interface FileRecord {
  id: number
  name: string
  url: string
  ext: string
  size: number
  mtime: string
  path: string
  [key: string]: unknown
}

const loading = ref(false)
const uploading = ref(false)
const files = ref<FileRecord[]>([])
const selectedIds = ref<number[]>([])
const selectedRows = ref<FileRecord[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

const searchParams = reactive({ keyword: '', ext: '' })

const searchFields = computed(() => [
  { prop: 'keyword', label: t('file.fileName'), type: 'input', placeholder: t('file.inputFileName') },
  {
    prop: 'ext',
    label: t('file.fileType'),
    type: 'select',
    placeholder: t('file.allTypes'),
    options: () => [
      { label: t('file.image'), value: 'image' },
      { label: t('file.doc'), value: 'doc' },
      { label: t('file.sheet'), value: 'sheet' },
      { label: t('file.archive'), value: 'archive' },
      { label: 'PDF', value: 'pdf' },
      { label: t('file.text'), value: 'text' },
    ],
  },
])

const extCategoryMap: Record<string, string[]> = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'],
  doc: ['.doc', '.docx'],
  sheet: ['.xls', '.xlsx', '.csv'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz'],
  pdf: ['.pdf'],
  text: ['.md', '.txt', '.log'],
}

const filteredFiles = computed(() => {
  let result = files.value
  if (searchParams.keyword) {
    const kw = searchParams.keyword.toLowerCase()
    result = result.filter((f: FileRecord) => (f.name || '').toLowerCase().includes(kw))
  }
  if (searchParams.ext) {
    const exts = extCategoryMap[searchParams.ext] || []
    result = result.filter((f: FileRecord) => exts.includes((f.ext || '').toLowerCase()))
  }
  return result
})

const onQuery = () => {
  // 前端筛选，无需请求后端
}

const columns = computed(() => [
  { prop: 'index', label: t('common.index'), width: 60 },
  { prop: 'preview', label: t('file.preview'), width: 80 },
  { prop: 'name', label: t('file.fileName'), minWidth: 300, showOverflowTooltip: true },
  { prop: 'size', label: t('file.size'), width: 100 },
  { prop: 'ext', label: t('file.type'), width: 80 },
  { prop: 'mtime', label: t('file.uploadTime'), width: 180 },
  { prop: 'actions', label: t('common.operation'), fixed: 'right' },
])

const fetchFiles = async () => {
  loading.value = true
  try {
    const res = await uploadApi.list()
    const mappedFiles = ((res.data || []) as FileRecord[]).map((item, index) => ({
      ...item,
      id: index + 1,
    }))
    files.value = mappedFiles
  } catch (err: unknown) {
    ElMessage.error(t('file.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const previewUrl = (url: string): string => {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return url
}

const isImage = (ext: string): boolean => {
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext)
}

const fileIcon = (ext: string): string => {
  if (isImage(ext)) return 'PictureFilled'
  if (['.pdf'].includes(ext)) return 'Document'
  if (['.doc', '.docx'].includes(ext)) return 'DocumentCopy'
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return 'Grid'
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'FolderOpened'
  if (['.md', '.txt', '.log'].includes(ext)) return 'Notebook'
  return 'Document'
}

const fileIconColor = (ext: string): string => {
  if (isImage(ext)) return '#409eff'
  if (['.pdf'].includes(ext)) return '#f56c6c'
  if (['.doc', '.docx'].includes(ext)) return '#409eff'
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return '#67c23a'
  if (['.zip', '.rar', '.7z'].includes(ext)) return '#e6a23c'
  return '#909399'
}

const fileTagType = (ext: string): 'success' | 'warning' | 'info' | 'primary' | 'danger' => {
  if (isImage(ext)) return 'primary'
  if (['.pdf'].includes(ext)) return 'danger'
  if (['.doc', '.docx'].includes(ext)) return 'primary'
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return 'success'
  if (['.zip', '.rar', '.7z'].includes(ext)) return 'warning'
  return 'info'
}

const formatSize = (bytes: number): string => {
  if (!bytes) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return size.toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

const formatTime = (time: string | number | Date): string => {
  if (!time) return '-'
  const d = new Date(time)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const triggerUpload = (): void => {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

const handleFileSelect = async (e: Event): Promise<void> => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const blockedExts = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.reg', '.vbs', '.ps1', '.jar', '.dll', '.scr', '.com', '.pif', '.vb', '.wsf', '.hta']
  const ext = '.' + file.name.split('.').pop()!.toLowerCase()
  if (blockedExts.includes(ext)) {
    ElMessage.error(t('file.uploadBlocked'))
    if (fileInputRef.value) fileInputRef.value.value = ''
    return
  }
  if (file.size > 50 * 1024 * 1024) {
    ElMessage.error(t('file.uploadSizeLimit'))
    if (fileInputRef.value) fileInputRef.value.value = ''
    return
  }

  uploading.value = true
  try {
    const res = await uploadApi.uploadFile(file)
    if (res.code === 0) {
      ElMessage.success(t('file.uploadSuccess') + ': ' + (res.data.filename || res.data.originalName))
      fetchFiles()
    } else {
      ElMessage.error(res.message || t('file.uploadFailed'))
    }
  } catch (err: unknown) {
    ElMessage.error(t('file.uploadFailed') + ': ' + getErrorMessage(err))
  } finally {
    uploading.value = false
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}

const handleSelectionChange = (rows: FileRecord[]): void => {
  selectedRows.value = rows
  selectedIds.value = rows.map((r) => r.id)
}

const copyUrl = async (url: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(previewUrl(url))
    ElMessage.success(t('file.linkCopied'))
  } catch {
    // 剪贴板写入失败，降级提示用户手动复制
    ElMessage.warning(t('file.copyFailed'))
  }
}

const handleDelete = (row: Record<string, unknown>): void => {
  const fileRow = row as FileRecord
  ElMessageBox.confirm(`${t('file.deleteConfirm')}「${fileRow.name}」？`, t('common.tip'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: 'warning',
  })
    .then(async () => {
      try {
        await uploadApi.remove(String(fileRow.id))
        ElMessage.success(t('file.deleteSuccess'))
        fetchFiles()
      } catch (err: unknown) {
        ElMessage.error(t('file.deleteFailed') + ': ' + getErrorMessage(err))
      }
    })
    .catch(() => {
      // 用户取消删除
    })
}

const handleBatchDelete = (): void => {
  ElMessageBox.confirm(`${t('file.deleteConfirm')}${t('file.selected')}${selectedIds.value.length} ${t('file.files')}？`, t('common.tip'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: 'warning',
  })
    .then(async () => {
      try {
        for (const row of selectedRows.value) {
          await uploadApi.remove(String(row.id))
        }
        ElMessage.success(t('file.batchDeleteSuccess') + ' ' + selectedRows.value.length + ' ' + t('file.files'))
        selectedIds.value = []
        selectedRows.value = []
        fetchFiles()
      } catch (err: unknown) {
        ElMessage.error(t('file.deleteFailed') + ': ' + getErrorMessage(err))
      }
    })
    .catch(() => {
      // 用户取消批量删除
    })
}

onMounted(fetchFiles)
</script>

<style lang="scss" scoped>
.batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding: 12px 20px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--hover-bg);
  font-size: 13px;
  color: var(--text-regular);
}
</style>
