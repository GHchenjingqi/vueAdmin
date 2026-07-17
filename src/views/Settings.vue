<template>
  <div class="settings-page">
    <el-row :gutter="20">
      <el-col :xs="24" :sm="24" :md="12">
        <el-card shadow="never" class="settings-card">
          <template #header>
            <div class="q-title">
              {{ t('settings.siteInfo') }}
            </div>
          </template>
          <el-form ref="formRef" :model="form" :rules="rules" label-width="120px" label-position="right">
            <el-row :gutter="40">
              <el-col :span="24">
                <el-form-item :label="t('settings.siteTitle')" prop="site_title">
                  <el-input v-model="form.site_title" :placeholder="t('settings.inputSiteTitle')" maxlength="100" show-word-limit />
                </el-form-item>
              </el-col>
              <el-col :span="24">
                <el-form-item :label="t('settings.siteKeywords')" prop="site_keywords">
                  <el-input v-model="form.site_keywords" :placeholder="t('settings.inputKeywords')" maxlength="200" show-word-limit />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item :label="t('settings.siteDescription')" prop="site_description">
              <el-input
                v-model="form.site_description"
                type="textarea"
                :rows="3"
                :placeholder="t('settings.inputDescription')"
                maxlength="300"
                show-word-limit
              />
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="settings-card">
          <template #header>
            <div class="q-title">
              {{ t('settings.featureToggle') }}
            </div>
          </template>
          <el-form :model="form" label-width="120px" label-position="right">
            <el-row :gutter="40">
              <el-col :span="24">
                <el-form-item :label="t('settings.loginCaptcha')">
                  <el-switch v-model="form.captcha_enabled" :active-text="t('settings.open')" :inactive-text="t('settings.close')" />
                </el-form-item>
                <div class="form-tip" style="margin-left: 120px; margin-top: -14px; margin-bottom: 18px">
                  {{ t('settings.captchaTip') }}
                </div>
              </el-col>
              <el-col :span="24">
                <el-form-item :label="t('settings.imageCompress')">
                  <el-switch v-model="form.image_compress" :active-text="t('settings.open')" :inactive-text="t('settings.close')" />
                </el-form-item>
                <div class="form-tip" style="margin-left: 120px; margin-top: -14px; margin-bottom: 18px">
                  {{ t('settings.compressTip') }}
                </div>
              </el-col>
            </el-row>
          </el-form>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="24" :md="12">
        <el-card shadow="never" class="settings-card">
          <template #header>
            <div class="q-title">
              {{ t('settings.brand') }}
            </div>
          </template>
          <el-form :model="form" label-width="120px" label-position="right">
            <el-row :gutter="40">
              <el-col :span="24">
                <el-form-item :label="t('settings.siteLogo')" style="margin-bottom: 40px">
                  <div style="width: 100%">
                    <div class="upload-row">
                      <el-upload
                        v-if="!form.site_logo"
                        :action="uploadUrl"
                        :headers="uploadHeaders"
                        :show-file-list="false"
                        :on-success="(res) => handleUploadSuccess(res, 'site_logo')"
                        :before-upload="beforeUpload"
                        accept="image/*"
                      >
                        <el-button type="primary" :icon="Upload">
                          {{ t('settings.selectImage') }}
                        </el-button>
                      </el-upload>
                      <el-image v-if="form.site_logo" :src="previewUrl(form.site_logo)" fit="contain" class="logo-preview" />
                      <el-button v-if="form.site_logo" type="danger" link :icon="Delete" @click="form.site_logo = ''">
                        {{ t('settings.remove') }}
                      </el-button>
                      <el-button link :icon="FolderOpened" @click="openFilePicker('site_logo')">
                        {{ t('settings.fromLibrary') }}
                      </el-button>
                    </div>
                    <div class="form-tip">
                      {{ t('settings.logoTip') }}
                    </div>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :span="24">
                <el-form-item :label="t('settings.browserIcon')" style="margin-bottom: 36px">
                  <div style="width: 100%">
                    <div class="upload-row">
                      <el-upload
                        v-if="!form.site_favicon"
                        :action="uploadUrl"
                        :headers="uploadHeaders"
                        :show-file-list="false"
                        :on-success="(res) => handleUploadSuccess(res, 'site_favicon')"
                        :before-upload="beforeUpload"
                        accept="image/*"
                      >
                        <el-button type="primary" :icon="Upload">
                          {{ t('settings.selectIcon') }}
                        </el-button>
                      </el-upload>
                      <img v-if="form.site_favicon" :src="previewUrl(form.site_favicon)" class="favicon-preview" />
                      <el-button v-if="form.site_favicon" type="danger" link :icon="Delete" @click="form.site_favicon = ''">
                        {{ t('settings.remove') }}
                      </el-button>
                      <el-button :icon="FolderOpened" link @click="openFilePicker('site_favicon')">
                        {{ t('settings.fromLibrary') }}
                      </el-button>
                    </div>
                    <div class="form-tip">
                      {{ t('settings.faviconTip') }}
                    </div>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </el-card>

        <el-card shadow="never" class="settings-card">
          <template #header>
            <div class="q-title">
              {{ t('settings.watermark') }}
            </div>
          </template>
          <el-form :model="form" label-width="120px" label-position="right">
            <el-row :gutter="40">
              <el-col :span="24">
                <el-form-item :label="t('settings.globalWatermark')">
                  <el-switch v-model="form.watermark_enabled" :active-text="t('settings.open')" :inactive-text="t('settings.close')" />
                </el-form-item>
                <div class="form-tip" style="margin-left: 120px; margin-top: -14px; margin-bottom: 18px">
                  {{ t('settings.watermarkTip') }}
                </div>
              </el-col>
              <el-col :span="24">
                <el-form-item :label="t('settings.watermarkText')">
                  <el-input
                    v-model="form.watermark_text"
                    :placeholder="t('settings.inputWatermark')"
                    maxlength="50"
                    show-word-limit
                    :disabled="!form.watermark_enabled"
                  />
                </el-form-item>
                <div class="form-tip" style="margin-left: 120px; margin-top: -14px; margin-bottom: 18px">
                  {{ t('settings.watermarkTextTip') }}
                </div>
              </el-col>
            </el-row>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
    <!-- 操作按钮-->
    <div class="settings-actions">
      <el-button type="primary" :loading="saving" :icon="Check" size="large" @click="handleSave">
        {{ t('settings.saveSettings') }}
      </el-button>
      <el-button :icon="Refresh" size="large" @click="handleReset">
        {{ t('settings.reset') }}
      </el-button>
    </div>

    <el-dialog
      v-model="filePickerVisible"
      :title="t('filePicker.selectFromLibrary')"
      width="800px"
      :close-on-click-modal="false"
      :destroy-on-close="true"
      top="5vh"
      @closed="handlePickerClosed"
    >
      <div class="file-picker__search">
        <el-input
          v-model="pickerSearchKeyword"
          :placeholder="t('filePicker.searchPlaceholder')"
          clearable
          size="small"
          style="width: 260px"
          @input="handlePickerSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <span class="file-picker__count">{{ t('filePicker.total') }}: {{ pickerFilteredFiles.length }}</span>
      </div>

      <div v-loading="pickerLoading" class="file-picker__grid">
        <div
          v-for="file in pickerFilteredFiles"
          :key="file.url"
          class="file-picker__item"
          :class="{ 'file-picker__item--selected': pickerSelectedUrl === file.url }"
          @click="handlePickerSelect(file)"
          @dblclick="handlePickerConfirm(file)"
        >
          <div class="file-picker__thumb">
            <el-image v-if="isImageFile(file.ext)" :src="pickerPreviewUrl(file.url)" fit="cover" style="width: 100%; height: 100%" />
            <el-icon v-else :size="32" color="#909399">
              <Document />
            </el-icon>
          </div>
          <div class="file-picker__name" :title="file.name">
            {{ file.name }}
          </div>
          <div class="file-picker__size">
            {{ pickerFormatSize(file.size) }}
          </div>
        </div>

        <el-empty v-if="!pickerLoading && pickerFilteredFiles.length === 0" :description="t('filePicker.noFiles')" />
      </div>

      <template #footer>
        <el-button @click="filePickerVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="primary" :disabled="!pickerSelectedUrl" @click="handlePickerConfirm()">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Upload, Delete, Check, Refresh, FolderOpened, Search, Document } from '@element-plus/icons-vue'
import { settingApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { getAccessToken } from '@/utils/request'
import { useI18n } from '@/i18n'
import { uploadApi } from '@/api'

const { t } = useI18n()

const boolKeys = ['captcha_enabled', 'image_compress', 'watermark_enabled']

const formRef = ref<InstanceType<typeof import('element-plus').ElForm> | null>(null)
const saving = ref(false)

const uploadUrl = '/api/upload'
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${getAccessToken()}`,
}))

let form = reactive({
  site_title: '',
  site_description: '',
  site_keywords: '',
  site_logo: '',
  site_favicon: '',
  captcha_enabled: false,
  image_compress: false,
  watermark_enabled: false,
  watermark_text: '',
})

const rules = {
  site_title: [{ required: true, message: t('settings.inputSiteTitle'), trigger: 'blur' }],
}

interface UploadResponse {
  code: number
  data: { url: string }
  message?: string
}

const previewUrl = (url: string): string => {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return url
}

const beforeUpload = (rawFile: import('element-plus').UploadRawFile): boolean => {
  const isImage = rawFile.type?.startsWith('image/') ?? false
  if (!isImage) {
    ElMessage.error(t('settings.imageOnly'))
    return false
  }
  if (rawFile.size > 5 * 1024 * 1024) {
    ElMessage.error(t('settings.imageSizeLimit'))
    return false
  }
  return true
}

const handleUploadSuccess = (res: UploadResponse, field: string): void => {
  if (res.code === 0) {
    const formRecord = form as Record<string, unknown>
    formRecord[field] = res.data.url
    ElMessage.success(field === 'site_logo' ? t('settings.logoUploadSuccess') : t('settings.iconUploadSuccess'))
  } else {
    ElMessage.error(res.message || t('settings.uploadFailed'))
  }
}

/** 文件选择弹窗状态 */
const filePickerVisible = ref(false)
const filePickerField = ref<string>('site_logo')
const pickerLoading = ref(false)
const pickerFiles = ref<{ url: string; name: string; size: number; ext: string }[]>([])
const pickerFilteredFiles = ref<{ url: string; name: string; size: number; ext: string }[]>([])
const pickerSelectedUrl = ref('')
const pickerSelectedFile = ref<{ url: string; name: string; size: number; ext: string } | null>(null)
const pickerSearchKeyword = ref('')

const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico']

const isImageFile = (ext: string): boolean => {
  return imageExts.includes(ext)
}

const pickerPreviewUrl = (url: string): string => {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return url
}

const pickerFormatSize = (bytes: number): string => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

const openFilePicker = (field: string) => {
  filePickerField.value = field
  filePickerVisible.value = true
  fetchPickerFiles()
}

const fetchPickerFiles = async () => {
  pickerLoading.value = true
  try {
    const res = await uploadApi.list()
    pickerFiles.value = res.data || []
    pickerFilteredFiles.value = [...pickerFiles.value]
  } catch (_err) {
    pickerFiles.value = []
    pickerFilteredFiles.value = []
    ElMessage.error(t('filePicker.loadFailed'))
  } finally {
    pickerLoading.value = false
  }
}

const handlePickerSearch = () => {
  const keyword = pickerSearchKeyword.value.toLowerCase().trim()
  if (!keyword) {
    pickerFilteredFiles.value = [...pickerFiles.value]
    return
  }
  pickerFilteredFiles.value = pickerFiles.value.filter(
    (file) => file.name.toLowerCase().includes(keyword) || (file.ext && file.ext.toLowerCase().includes(keyword)),
  )
}

const handlePickerSelect = (file: { url: string; name: string; size: number; ext: string }) => {
  pickerSelectedUrl.value = file.url
  pickerSelectedFile.value = file
}

const handlePickerConfirm = (file?: { url: string; name: string; size: number; ext: string }) => {
  const target = file || pickerSelectedFile.value
  if (target) {
    if (filePickerField.value === 'site_logo') {
      form.site_logo = target.url
    } else if (filePickerField.value === 'site_favicon') {
      form.site_favicon = target.url
    }
    filePickerVisible.value = false
  }
}

const handlePickerClosed = () => {
  pickerSelectedUrl.value = ''
  pickerSelectedFile.value = null
  pickerSearchKeyword.value = ''
}

const fetchSettings = async () => {
  try {
    const res = await settingApi.list()
    const data = res.data || {}
    const formRecord = form as Record<string, unknown>
    Object.keys(form).forEach((key) => {
      if (data[key] !== undefined) {
        const val = data[key]
        if (boolKeys.includes(key)) {
          formRecord[key] = val === '1' || val === 1 || val === true
        } else {
          formRecord[key] = val
        }
      }
    })
  } catch (err: unknown) {
    ElMessage.error(t('settings.fetchFailed') + ': ' + getErrorMessage(err))
  }
}

const handleSave = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    const payload: Record<string, unknown> = { ...form }
    const formRecord = form as Record<string, unknown>
    boolKeys.forEach((key: string) => {
      payload[key] = formRecord[key] ? '1' : '0'
    })
    await settingApi.save(payload)
    ElMessage.success(t('settings.saveSuccess'))
    setTimeout(() => location.reload(), 1000)
  } catch (err: unknown) {
    ElMessage.error(t('settings.saveFailed') + ': ' + getErrorMessage(err))
  } finally {
    saving.value = false
  }
}

const handleReset = () => {
  fetchSettings()
  ElMessage.info(t('settings.resetToCurrent'))
}

onMounted(fetchSettings)
</script>

<style lang="scss" scoped>
.settings-page {
  padding: 20px;
}

.settings-card {
  margin-bottom: 20px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--card-bg);
}

.settings-card :deep(.el-card__header) {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-light);
  background: var(--card-header-bg);
}

.settings-card :deep(.el-card__body) {
  padding: 24px;
}

.upload-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.logo-preview {
  width: 200px;
  height: 60px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  padding: 4px;
  background: var(--content-bg);
}

.favicon-preview {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  margin-right: calc(200px - 32px);
  object-fit: contain;
}

.form-tip {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  line-height: 1.5;
}

.settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 0;
}

.file-picker__search {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.file-picker__count {
  font-size: 13px;
  color: var(--text-secondary);
}
.file-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  max-height: 460px;
  overflow-y: auto;
}
.file-picker__item {
  border: 1px solid var(--border-light, #dcdfe6);
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}
.file-picker__item:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
}
.file-picker__item--selected {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9, #ecf5ff);
}
.file-picker__thumb {
  width: 100%;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 4px;
  background: var(--content-bg, #f5f7fa);
}
.file-picker__name {
  font-size: 12px;
  color: var(--text-primary, #303133);
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-picker__size {
  font-size: 11px;
  color: var(--text-secondary, #909399);
  margin-top: 2px;
}
</style>
