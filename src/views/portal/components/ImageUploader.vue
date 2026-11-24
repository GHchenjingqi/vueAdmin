<template>
  <div class="image-uploader">
    <el-upload
      class="image-uploader-drag"
      drag
      :show-file-list="false"
      accept="image/*"
      :multiple="max > 1"
      :http-request="handleUpload"
      :before-upload="beforeUpload"
      :disabled="modelValue.length >= max"
    >
      <div class="image-uploader-dropzone">
        <el-icon class="image-uploader-icon"><UploadFilled /></el-icon>
        <div class="image-uploader-drag-text">
          <span class="image-uploader-drag-title">{{ t('portal.uploadImage') }}</span>
          <span class="image-uploader-tip">{{ t('portal.imageTip') }} · {{ modelValue.length }}/{{ max }}</span>
        </div>
      </div>
    </el-upload>

    <div v-if="modelValue.length" class="image-uploader-list">
      <div
        v-for="(image, index) in modelValue"
        :key="image.url"
        class="image-uploader-item"
        :class="{ dragging: dragIndex === index, 'drag-over': dragOverIndex === index && dragIndex !== index }"
        :draggable="modelValue.length > 1"
        :title="t('portal.imageDragTip')"
        @dragstart="onDragStart(index, $event)"
        @dragover.prevent="onDragOver(index)"
        @dragleave="onDragLeave(index)"
        @drop.prevent="onDrop(index)"
        @dragend="onDragEnd"
      >
        <div class="image-uploader-thumb-wrap">
          <el-image :src="image.url" fit="cover" class="image-uploader-thumb" :draggable="false" :preview-src-list="imageUrls" :initial-index="index" />
          <span class="image-uploader-order">{{ index + 1 }}</span>
        </div>
        <div class="image-uploader-actions">
          <el-icon class="image-uploader-grip"><Rank /></el-icon>
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
import { computed, ref } from 'vue'
import { ElMessage, type UploadRequestOptions } from 'element-plus'
import { Rank, UploadFilled } from '@element-plus/icons-vue'
import { portalApi } from '@/api'
import type { PromptImageItem } from '@/api/prompt'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'

const props = withDefaults(
  defineProps<{
    modelValue: PromptImageItem[]
    max?: number
    /** 自定义上传通道：后台等场景可传入自己的专用上传接口，默认走投稿上传 */
    uploader?: (file: File) => Promise<{ data: { id: string; url: string } }>
  }>(),
  { max: 20 },
)
const emit = defineEmits<{ (e: 'update:modelValue', value: PromptImageItem[]): void }>()

const { t } = useI18n()
const imageUrls = computed(() => props.modelValue.map((image) => image.url))

const dragIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

const onDragStart = (index: number, event: DragEvent): void => {
  dragIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }
}

const onDragOver = (index: number): void => {
  if (dragIndex.value !== null) dragOverIndex.value = index
}

const onDragLeave = (index: number): void => {
  if (dragOverIndex.value === index) dragOverIndex.value = null
}

const endDrag = (): void => {
  dragIndex.value = null
  dragOverIndex.value = null
}

const onDrop = (index: number): void => {
  const from = dragIndex.value
  endDrag()
  if (from === null || from === index) return
  const next = [...props.modelValue]
  const [moved] = next.splice(from, 1)
  next.splice(index, 0, moved)
  // sort 与渲染顺序一致：步骤套组提交时按 image.sort 保存，单条按数组下标保存
  emit('update:modelValue', next.map((image, i) => ({ ...image, sort: i })))
}

const onDragEnd = (): void => {
  endDrag()
}

const beforeUpload = (file: File): boolean => {
  if (props.modelValue.length >= props.max) {
    ElMessage.error(props.max === 1 ? t('portal.stepImageLimit') : t('portal.imageGroupLimit'))
    return false
  }
  if (!file.type.startsWith('image/')) {
    ElMessage.error(t('portal.imageTypeInvalid'))
    return false
  }
  if (file.size > 15 * 1024 * 1024) {
    ElMessage.error(t('portal.imageSizeExceeded'))
    return false
  }
  return true
}

const handleUpload = async (options: UploadRequestOptions): Promise<void> => {
  if (props.modelValue.length >= props.max) {
    ElMessage.error(props.max === 1 ? t('portal.stepImageLimit') : t('portal.imageGroupLimit'))
    return
  }
  try {
    const upload = props.uploader ?? portalApi.uploadImage
    const res = await upload(options.file)
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
.image-uploader-drag {
  display: block;
  width: 100%;
}
.image-uploader-drag :deep(.el-upload),
.image-uploader-drag :deep(.el-upload-dragger) {
  width: 100%;
}

.image-uploader-dropzone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 64px;
  padding: 14px 16px;
  box-sizing: border-box;
}

.image-uploader-icon {
  font-size: 30px;
  color: var(--brand);
}

.image-uploader-drag-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.image-uploader-drag-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
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
  cursor: grab;
  transition: opacity 0.15s, box-shadow 0.15s;
}

.image-uploader-item:active {
  cursor: grabbing;
}

.image-uploader-item.dragging {
  opacity: 0.4;
}

.image-uploader-item.drag-over {
  box-shadow: 0 0 0 2px var(--brand);
}

.image-uploader-thumb-wrap {
  position: relative;
}

.image-uploader-thumb {
  width: 100%;
  height: 96px;
  display: block;
  user-select: none;
}

.image-uploader-order {
  position: absolute;
  left: 6px;
  top: 6px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: rgba(31, 36, 48, 0.85);
  color: #fff;
  font-size: 11px;
  line-height: 1;
}

.image-uploader-grip {
  color: var(--ink-3);
  font-size: 14px;
  flex-shrink: 0;
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
