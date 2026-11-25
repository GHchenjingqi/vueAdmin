<template>
  <div class="cl-editor">
    <p class="cl-tip">{{ t('portal.characterLibraryTip') }}</p>
    <div v-for="group in GROUPS" :key="group.key" class="cl-group">
      <div class="cl-group-head">
        <span class="cl-group-title">{{ t(group.titleKey) }}</span>
        <el-button size="small" :icon="FolderOpened" @click="openPicker(group.key)">{{ t('portal.pickFromLibrary') }}</el-button>
      </div>
      <ImageUploader
        :model-value="modelValue[group.key]"
        :max="20"
        :show-cover="false"
        :uploader="uploader"
        @update:model-value="updateGroup(group.key, $event)"
      />
    </div>

    <ImagePickerDialog v-model="pickerVisible" scope="character" :source="source" :title="pickerTitle" @select="onPickImage" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { FolderOpened } from '@element-plus/icons-vue'
import type { PromptCharacterLibraryInput, PromptImageItem } from '@/api/prompt'
import { useI18n } from '@/i18n'
import ImageUploader from './ImageUploader.vue'
import ImagePickerDialog from './ImagePickerDialog.vue'

const props = withDefaults(
  defineProps<{
    modelValue: PromptCharacterLibraryInput
    source?: 'portal' | 'admin'
    uploader?: (file: File) => Promise<{ data: { id: string; url: string } }>
  }>(),
  { source: 'portal', uploader: undefined },
)

const emit = defineEmits<{ (e: 'update:modelValue', value: PromptCharacterLibraryInput): void }>()

const { t } = useI18n()

const GROUPS = [
  { key: 'turnarounds', titleKey: 'portal.charGroupTurnarounds', picker: 'character' },
  { key: 'costumes', titleKey: 'portal.charGroupCostumes', picker: 'character' },
  { key: 'hairstyles', titleKey: 'portal.charGroupHairstyles', picker: 'character' },
  { key: 'props', titleKey: 'portal.charGroupProps', picker: 'character' },
] as const

type GroupKey = (typeof GROUPS)[number]['key']

const pickerVisible = ref(false)
const pickerGroup = ref<GroupKey>('turnarounds')

const pickerTitle = computed(() => t(GROUPS.find((group) => group.key === pickerGroup.value)?.titleKey ?? ''))

const openPicker = (key: GroupKey): void => {
  pickerGroup.value = key
  pickerVisible.value = true
}

const updateGroup = (key: GroupKey, images: PromptImageItem[]): void => {
  emit('update:modelValue', { ...props.modelValue, [key]: images.map((image) => ({ url: image.url, filePath: image.filePath ?? null })) })
}

/** 从图库/资产选择：追加到当前组 */
const onPickImage = (image: PromptImageItem): void => {
  const current = props.modelValue[pickerGroup.value] ?? []
  if (current.some((item) => item.url === image.url)) {
    pickerVisible.value = false
    return
  }
  updateGroup(pickerGroup.value, [...current, { url: image.url, filePath: image.filePath ?? null }])
  pickerVisible.value = false
}
</script>

<style scoped>
.cl-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.cl-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.cl-group {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
}
.cl-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.cl-group-title {
  font-weight: 600;
  font-size: 13px;
}
</style>
