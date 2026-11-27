<template>
  <div class="cl-editor">
    <p class="cl-tip">{{ t('portal.characterLibraryTip') }}</p>
    <el-tabs v-model="activeGroup" class="cl-tabs">
      <el-tab-pane v-for="group in GROUPS" :key="group.key" :name="group.key">
        <template #label>
          <span class="cl-tab-label">
            {{ t(group.titleKey) }}
            <span v-if="countOf(group.key)" class="cl-tab-count">{{ countOf(group.key) }}</span>
          </span>
        </template>
        <div class="cl-group-head">
          <el-button size="small" :icon="FolderOpened" @click="openPicker(group.key)">{{ t('portal.pickFromLibrary') }}</el-button>
        </div>
        <ImageUploader
          :model-value="modelValue[group.key]"
          :max="20"
          :show-cover="false"
          :uploader="uploader"
          @update:model-value="updateGroup(group.key, $event)"
        />
      </el-tab-pane>
    </el-tabs>

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
  { key: 'expressions', titleKey: 'portal.charGroupExpressions', picker: 'character' },
] as const

type GroupKey = (typeof GROUPS)[number]['key']

const activeGroup = ref<GroupKey>('turnarounds')

const pickerVisible = ref(false)
const pickerGroup = ref<GroupKey>('turnarounds')

const pickerTitle = computed(() => t(GROUPS.find((group) => group.key === pickerGroup.value)?.titleKey ?? ''))

const countOf = (key: GroupKey): number => props.modelValue[key]?.length ?? 0

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
.cl-group-head {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}
.cl-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cl-tab-count {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  color: #fff;
  background: var(--el-color-primary);
  border-radius: 8px;
}
</style>
