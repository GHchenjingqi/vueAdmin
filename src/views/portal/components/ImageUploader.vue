<template>
  <div class="image-uploader">
    <div class="image-uploader-bar">
      <el-upload :show-file-list="false" accept="image/*" multiple :http-request="handleUpload" :before-upload="beforeUpload">
        <el-button :icon="UploadFilled">{{ t('portal.uploadImage') }}</el-button>
      </el-upload>
      <span class="image-uploader-tip">{{ t('portal.imageTip') }} · {{ modelValue.length }}/20</span>
    </div>

    <div v-if="modelValue.length" class="image-uploader-list">
      <div v-for="(image, index) in modelValue" :key="image.url" class="image-uploader-item">
        <el-image :src="image.url" fit="cover" class="image-uploader-thumb" :preview-src-list="imageUrls" :initial-index="index" />
        <div class="image-uploader-actions">
          <el-tag v-if="image.isCover" type="success" size="small" effect="dark">{{ t('portal.cover') }}</el-tag>
          <el-button v-else link size="small" @click="setCover(index)">{{ t('portal.setCover') }}</el-button>
          <el-button link type="danger" size="small" @click="removeImage(index)">{{ t('common.delete') }}</el-button>
        </div>
      </div>
    </div>
    <div v-else class="image-uploader-empty">{{ t('portal.noImages') }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage, type UploadRequestOptions } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { portalApi } from '@/api'
import type { PromptImageItem } from '@/api/prompt'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'

const props = defineProps<{ modelValue: PromptImageItem[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: PromptImageItem[]): void }>()

const { t } = useI18n()
const imageUrls = computed(() => props.modelValue.map((image) => image.url))

const beforeUpload = (file: File): boolean => {
  if (props.modelValue.length >= 20) {
    ElMessage.error(t('portal.imageGroupLimit'))
    return false
  }
  if (!file.type.startsWith('image/')) {
    ElMessage.error(t('portal.imageTypeInvalid'))
    return false
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error(t('portal.imageSizeExceeded'))
    return false
  }
  return true
}

const handleUpload = async (options: UploadRequestOptions): Promise<void> => {
  if (props.modelValue.length >= 20) {
    ElMessage.error(t('portal.imageGroupLimit'))
    return
  }
  try {
    const res = await portalApi.uploadImage(options.file)
    const next = [...props.modelValue]
    next.push({ url: res.data.url, filePath: res.data.id, sort: next.length, isCover: next.length === 0 })
    emit('update:modelValue', next)
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  }
}

const setCover = (index: number): void => {
  emit(
    'update:modelValue',
    props.modelValue.map((image, i) => ({ ...image, isCover: i === index })),
  )
}

const removeImage = (index: number): void => {
  const wasCover = Boolean(props.modelValue[index]?.isCover)
  const next = props.modelValue.filter((_, i) => i !== index)
  if (wasCover && next.length) next[0] = { ...next[0], isCover: true }
  emit('update:modelValue', next)
}
</script>

<style scoped>
.image-uploader-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.image-uploader-tip {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--ink-3);
}

.image-uploader-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}

.image-uploader-item {
  width: 132px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--card-bg);
}

.image-uploader-thumb {
  width: 100%;
  height: 96px;
  display: block;
}

.image-uploader-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 4px 6px;
  min-height: 30px;
  border-top: 1px solid var(--line);
}

.image-uploader-empty {
  margin-top: 12px;
  padding: 22px;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius);
  text-align: center;
  font-size: 13px;
  color: var(--ink-3);
  background: var(--card-bg);
}
</style>
