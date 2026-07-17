<template>
  <el-dialog v-model="visible" :title="t('user.importUser')" width="500px" :close-on-click-modal="false" destroy-on-close @closed="handleClosed">
    <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px">
      <template #title>
        {{ t('user.importTips') }}
      </template>
    </el-alert>

    <el-upload drag :auto-upload="false" :limit="1" accept=".xlsx,.xls" :on-change="handleFileChange" :on-remove="handleFileRemove" :file-list="fileList">
      <el-icon class="el-icon--upload">
        <Upload />
      </el-icon>
      <div class="el-upload__text">
        {{ t('common.dragHere') }}，
        <em>{{ t('common.clickUpload') }}</em>
      </div>
      <template #tip>
        <div class="el-upload__tip">{{ t('common.fileTypeTip') }}，{{ t('common.fileSizeLimit') }}</div>
      </template>
    </el-upload>

    <div v-if="importResult" style="margin-top: 16px">
      <el-divider />
      <div style="display: flex; gap: 24px; margin-bottom: 12px">
        <el-tag type="success" size="large">{{ t('user.importSuccess') }} {{ importResult.success }}</el-tag>
        <el-tag type="danger" size="large">{{ t('user.importFail') }} {{ importResult.failed }}</el-tag>
      </div>
      <div v-if="importResult.errors && importResult.errors.length" style="max-height: 200px; overflow-y: auto">
        <el-alert v-for="(err, idx) in importResult.errors" :key="idx" :title="err" type="error" :closable="false" style="margin-bottom: 4px" />
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">
        {{ t('common.close') }}
      </el-button>
      <el-button type="primary" :loading="importLoading" :disabled="!selectedFile" @click="handleImportSubmit">
        {{ t('user.startImport') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { UploadFile, UploadFiles } from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
import { userApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'success'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const importLoading = ref(false)
const selectedFile = ref<File | null>(null)
const fileList = ref<{ name: string }[]>([])
const importResult = ref<{ success: number; failed: number; errors?: string[] } | null>(null)

function handleFileChange(uploadFile: UploadFile, _uploadFiles: UploadFiles): void {
  if (uploadFile.raw) {
    selectedFile.value = uploadFile.raw
  }
  importResult.value = null
}

function handleFileRemove(): void {
  selectedFile.value = null
  importResult.value = null
}

function handleClosed(): void {
  importResult.value = null
  selectedFile.value = null
  fileList.value = []
}

async function handleImportSubmit(): Promise<void> {
  if (!selectedFile.value) {
    ElMessage.warning(t('user.selectFileFirst'))
    return
  }
  importLoading.value = true
  importResult.value = null
  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    const res = await userApi.importUsers(formData)
    importResult.value = res.data
    if (res.data.failed === 0) {
      ElMessage.success(res.message)
    } else {
      ElMessage.warning(res.message)
    }
    emit('success')
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err) || t('user.importFailed'))
  } finally {
    importLoading.value = false
  }
}
</script>
