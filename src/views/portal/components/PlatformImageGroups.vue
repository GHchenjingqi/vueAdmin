<template>
  <div class="platform-groups">
    <div class="groups-head">
      <div class="groups-title">{{ title }}</div>
      <el-button class="add-group" link type="primary" size="small" :disabled="!hasAvailable" @click="addGroup">+ {{ t('portal.addPlatformGroup') }}</el-button>
    </div>
    <div v-for="(group, index) in modelValue" :key="index" class="platform-group">
      <div class="group-head">
        <span class="group-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <el-select
          :model-value="group.platformId"
          :placeholder="t('portal.platformSelect')"
          class="group-select"
          @update:model-value="changePlatform(index, $event as number)"
        >
          <el-option v-for="platform in optionsFor(index)" :key="platform.id" :label="platform.name" :value="platform.id" />
        </el-select>
        <el-button link type="danger" size="small" @click="removeGroup(index)">{{ t('portal.removePlatformGroup') }}</el-button>
      </div>
      <ImageUploader :model-value="group.images" :max="max" :uploader="uploader" @update:model-value="updateImages(index, $event)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PromptImageGroupInput, PromptImageItem, PromptPlatform } from '@/api/prompt'
import ImageUploader from './ImageUploader.vue'
import { useI18n } from '@/i18n'

const props = withDefaults(
  defineProps<{
    modelValue: PromptImageGroupInput[]
    platforms: PromptPlatform[]
    max?: number
    /** 分组区标题，单条模式传「效果图」，步骤套组不传则不显示 */
    title?: string
    /** 自定义上传通道，透传给 ImageUploader */
    uploader?: (file: File) => Promise<{ data: { id: string; url: string } }>
  }>(),
  { max: 20, title: '' },
)
const emit = defineEmits<{ (e: 'update:modelValue', value: PromptImageGroupInput[]): void }>()
const { t } = useI18n()

const usedIds = computed(() => props.modelValue.map((group) => group.platformId))
const hasAvailable = computed(() => props.platforms.some((platform) => !usedIds.value.includes(platform.id)))

const optionsFor = (index: number) => {
  const current = props.modelValue[index]?.platformId
  return props.platforms.filter((platform) => platform.id === current || !usedIds.value.includes(platform.id))
}

const changePlatform = (index: number, platformId: number) => {
  emit(
    'update:modelValue',
    props.modelValue.map((group, i) => (i === index ? { ...group, platformId } : group)),
  )
}

const updateImages = (index: number, images: PromptImageItem[]) => {
  emit(
    'update:modelValue',
    props.modelValue.map((group, i) => (i === index ? { ...group, images } : group)),
  )
}

const removeGroup = (index: number) => {
  emit(
    'update:modelValue',
    props.modelValue.filter((_, i) => i !== index),
  )
}

const addGroup = () => {
  const available = props.platforms.find((platform) => !usedIds.value.includes(platform.id))
  if (!available) return
  emit('update:modelValue', [...props.modelValue, { platformId: available.id, images: [] }])
}
</script>

<style scoped>
.platform-groups {
  width: 100%;
}

.platform-group {
  padding: 14px;
  margin-bottom: 12px;
  border: 1px solid var(--line);
  background: var(--card-bg);
}

.group-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}

.group-index {
  font-size: 13px;
  font-weight: 700;
  color: var(--brand);
}

.group-select {
  width: 200px;
  flex: 1;
  max-width: 260px;
}

.groups-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.groups-title {
  font-weight: 600;
}
.groups-title:empty {
  display: none;
}
.add-group {
  flex-shrink: 0;
}
</style>
