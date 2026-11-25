<template>
  <div class="platform-groups">
    <div class="groups-head">
      <div class="groups-title">{{ title }}</div>
      <el-button class="add-group" link type="primary" size="small" :disabled="!hasAvailable" @click="addGroup">+ {{ t('portal.addPlatformGroup') }}</el-button>
    </div>
    <template v-if="layout === 'tabs'">
      <el-tabs v-if="modelValue.length" v-model="activeTab" type="card" class="group-tabs">
        <el-tab-pane v-for="(group, index) in modelValue" :key="index" :name="String(index)">
          <template #label>
            <span class="tab-label">{{ String(index + 1).padStart(2, '0') }} {{ platformName(group.platformId) }}</span>
          </template>
          <div class="group-pane">
            <div class="group-head">
              <el-select
                :model-value="group.platformId"
                :placeholder="t('portal.platformSelect')"
                class="group-select"
                @update:model-value="changePlatform(index, $event as number)"
              >
                <el-option v-for="platform in optionsFor(index)" :key="platform.id" :label="platform.name" :value="platform.id" />
              </el-select>
              <el-button v-if="pickerScope" link type="primary" size="small" :icon="FolderOpened" @click="openPicker(index)">
                {{ t('portal.pickFromLibrary') }}
              </el-button>
              <el-button link type="danger" size="small" @click="removeGroup(index)">{{ t('portal.removePlatformGroup') }}</el-button>
            </div>
            <ImageUploader :model-value="group.images" :max="max" :uploader="uploader" @update:model-value="updateImages(index, $event)" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
    <template v-else>
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
          <el-button v-if="pickerScope" link type="primary" size="small" :icon="FolderOpened" @click="openPicker(index)">
            {{ t('portal.pickFromLibrary') }}
          </el-button>
          <el-button link type="danger" size="small" @click="removeGroup(index)">{{ t('portal.removePlatformGroup') }}</el-button>
        </div>
        <ImageUploader :model-value="group.images" :max="max" :uploader="uploader" @update:model-value="updateImages(index, $event)" />
      </div>
    </template>
    <ImagePickerDialog v-if="pickerScope" v-model="pickerVisible" :scope="pickerScope" @select="onPicked" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FolderOpened } from '@element-plus/icons-vue'
import type { PromptImageGroupInput, PromptImageItem, PromptPlatform } from '@/api/prompt'
import ImageUploader from './ImageUploader.vue'
import ImagePickerDialog from './ImagePickerDialog.vue'
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
    /** 多组时可用 tab 切换，避免竖排过长；默认竖排 */
    layout?: 'stack' | 'tabs'
    /** 传入后允许从图库选择图片（如角色姿势生成图选 'result'），不传则不显示入口 */
    pickerScope?: 'character' | 'pose' | 'result'
  }>(),
  { max: 20, title: '', layout: 'stack', pickerScope: undefined },
)
const emit = defineEmits<{ (e: 'update:modelValue', value: PromptImageGroupInput[]): void }>()
const { t } = useI18n()

const usedIds = computed(() => props.modelValue.map((group) => group.platformId))
const hasAvailable = computed(() => props.platforms.some((platform) => !usedIds.value.includes(platform.id)))

const activeTab = ref('0')
watch(
  () => props.modelValue.length,
  (length) => {
    const current = Number(activeTab.value)
    if (!length || !Number.isInteger(current) || current < 0 || current >= length) {
      activeTab.value = length ? String(length - 1) : '0'
    }
  },
  { immediate: true },
)

const platformName = (id: number) => props.platforms.find((platform) => platform.id === id)?.name ?? t('portal.platformSelect')

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
  activeTab.value = String(props.modelValue.length)
  emit('update:modelValue', [...props.modelValue, { platformId: available.id, images: [] }])
}

const pickerVisible = ref(false)
const pickerIndex = ref(0)

const openPicker = (index: number): void => {
  pickerIndex.value = index
  pickerVisible.value = true
}

/** 图库选择：追加到对应平台组（按 URL 去重） */
const onPicked = (image: PromptImageItem): void => {
  const group = props.modelValue[pickerIndex.value]
  if (!group) return
  if (group.images.some((item) => item.url === image.url)) {
    pickerVisible.value = false
    return
  }
  const picked: PromptImageItem = { url: image.url, filePath: image.filePath ?? null, sort: 0, isCover: false }
  updateImages(pickerIndex.value, [...group.images, picked])
  pickerVisible.value = false
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

.group-tabs {
  width: 100%;
}
.group-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.group-tabs :deep(.el-tabs__item) {
  padding: 0 14px;
}
.group-tabs :deep(.el-tabs__content) {
  padding: 14px;
  border: 1px solid var(--line);
  border-top: 0;
  background: var(--card-bg);
}
.group-pane .group-head {
  margin-top: 0;
  padding-top: 0;
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
