<template>
  <div class="page-container">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span>{{ t('shop.product.import.title') }}</span>
          <el-button :icon="Back" @click="router.push('/shop-product')">{{ t('shop.product.import.back') }}</el-button>
        </div>
      </template>

      <el-steps :active="step" align-center class="import-steps">
        <el-step :title="t('shop.product.import.stepUpload')" />
        <el-step :title="t('shop.product.import.stepPreview')" />
        <el-step :title="t('shop.product.import.stepResult')" />
      </el-steps>

      <!-- Step 1：上传 -->
      <div v-show="step === 0" class="step-body">
        <el-alert type="info" :closable="false" class="mb-4">
          <template #title>{{ t('shop.product.import.tip') }}</template>
          <div class="text-sm">
            {{ t('shop.product.import.tipBody') }}
          </div>
        </el-alert>
        <el-upload
          drag
          :auto-upload="false"
          :limit="1"
          accept=".csv,.xlsx"
          :on-change="onFileChange"
          :on-remove="onFileRemove"
          :file-list="fileList"
          class="import-upload"
        >
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">{{ t('shop.product.import.dropHere') }}</div>
          <template #tip>
            <div class="el-upload__tip">{{ t('shop.product.import.accept') }}</div>
          </template>
        </el-upload>
        <div class="flex gap-3 mt-4">
          <el-button @click="downloadTemplate">{{ t('shop.product.import.downloadTemplate') }}</el-button>
          <el-button type="primary" :disabled="!file" :loading="previewing" @click="doPreview">
            {{ t('shop.product.import.preview') }}
          </el-button>
        </div>
      </div>

      <!-- Step 2：预校验 -->
      <div v-show="step === 1" class="step-body">
        <div class="mb-4 flex flex-wrap gap-4 text-sm">
          <el-tag type="info">{{ t('shop.product.import.file') }}：{{ preview?.filename }}</el-tag>
          <el-tag>{{ t('shop.product.import.totalRows') }}：{{ preview?.totalRows }}</el-tag>
          <el-tag type="success">{{ t('shop.product.import.willCreateSpus') }}：{{ preview?.willCreateSpus }}</el-tag>
          <el-tag type="success">{{ t('shop.product.import.willCreateSkus') }}：{{ preview?.willCreateSkus }}</el-tag>
          <el-tag :type="errors.length ? 'danger' : 'info'">{{ t('shop.product.import.errors') }}：{{ errors.length }}</el-tag>
        </div>

        <template v-if="errors.length">
          <el-alert type="error" :title="t('shop.product.import.fixFirst')" :closable="false" class="mb-3" />
          <el-table :data="errors" border max-height="360" size="small">
            <el-table-column prop="row" :label="t('shop.product.import.colRow')" width="90" />
            <el-table-column prop="field" :label="t('shop.product.import.colField')" width="180" />
            <el-table-column prop="message" :label="t('shop.product.import.colMessage')" />
          </el-table>
        </template>
        <el-alert v-else type="success" :title="t('shop.product.import.noErrors')" :closable="false" />

        <div class="flex gap-3 mt-4">
          <el-button @click="step = 0">{{ t('shop.product.import.backToUpload') }}</el-button>
          <el-button type="primary" :disabled="errors.length > 0" :loading="committing" @click="doCommit">
            {{ t('shop.product.import.commit') }}
          </el-button>
        </div>
      </div>

      <!-- Step 3：结果 -->
      <div v-show="step === 2" class="step-body">
        <div v-if="result" class="mb-4 flex flex-wrap gap-4 text-sm">
          <el-tag type="success">{{ t('shop.product.import.createdSpus') }}：{{ result.createdSpus }}</el-tag>
          <el-tag type="success">{{ t('shop.product.import.createdSkus') }}：{{ result.createdSkus }}</el-tag>
          <el-tag :type="result.failed.length ? 'danger' : 'info'">{{ t('shop.product.import.failedCount') }}：{{ result.failed.length }}</el-tag>
        </div>

        <template v-if="result && result.failed.length">
          <el-alert type="warning" :title="t('shop.product.import.partialFail')" :closable="false" class="mb-3" />
          <el-table :data="result.failed" border max-height="360" size="small">
            <el-table-column prop="skuCode" :label="t('shop.product.import.colSkuCode')" width="220" />
            <el-table-column prop="message" :label="t('shop.product.import.colMessage')" />
          </el-table>
        </template>
        <el-alert v-else type="success" :title="t('shop.product.import.allSuccess')" :closable="false" />

        <div class="flex gap-3 mt-4">
          <el-button @click="resetAll">{{ t('shop.product.import.importMore') }}</el-button>
          <el-button type="primary" @click="router.push('/shop-product')">{{ t('shop.product.import.goList') }}</el-button>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { UploadFilled, Back } from '@element-plus/icons-vue'
import type { UploadFile, UploadUserFile } from 'element-plus'
import { spuApi, type ImportPreviewResult, type ImportCommitResult } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import { downloadBlob } from '@/utils/download'
import { useI18n } from '@/i18n'

const { t } = useI18n()
const router = useRouter()

const step = ref(0)
const file = ref<File | null>(null)
const fileList = ref<UploadUserFile[]>([])
const previewing = ref(false)
const committing = ref(false)
const preview = ref<ImportPreviewResult | null>(null)
const result = ref<ImportCommitResult | null>(null)

const errors = ref<{ row: number; field: string | null; message: string }[]>([])

function onFileChange(uploadFile: UploadFile): void {
  const raw = uploadFile.raw
  if (!raw) return
  file.value = raw
  fileList.value = [{ name: raw.name, raw }]
}

function onFileRemove(): void {
  file.value = null
  fileList.value = []
}

async function downloadTemplate(): Promise<void> {
  try {
    const res = await spuApi.importTemplate()
    downloadBlob(new Blob([res.data]), 'product-import-template.csv')
  } catch (err) {
    ElMessage.error(getErrorMessage(err))
  }
}

async function doPreview(): Promise<void> {
  if (!file.value) return
  previewing.value = true
  try {
    const res = await spuApi.importPreview(file.value)
    preview.value = res.data
    errors.value = res.data.errors
    step.value = 1
  } catch (err) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    previewing.value = false
  }
}

async function doCommit(): Promise<void> {
  if (!file.value) return
  committing.value = true
  try {
    const res = await spuApi.importCommit(file.value)
    result.value = res.data
    step.value = 2
  } catch (err) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    committing.value = false
  }
}

function resetAll(): void {
  step.value = 0
  file.value = null
  fileList.value = []
  preview.value = null
  result.value = null
  errors.value = []
}
</script>

<style scoped>
.import-steps {
  margin-bottom: 24px;
}
.step-body {
  max-width: 960px;
}
.import-upload {
  width: 100%;
}
</style>
