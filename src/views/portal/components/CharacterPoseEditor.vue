<template>
  <div class="character-pose-editor">
    <div class="cp-section">
      <div class="cp-title">{{ t('portal.characterImage') }}</div>
      <ImageUploader
        :model-value="draft.characterImage ? [draft.characterImage] : []"
        :max="1"
        :show-cover="false"
        :uploader="uploader"
        @update:model-value="setCharacterImage($event[0] || null)"
      />
      <el-button link type="primary" :icon="FolderOpened" @click="openPicker('character')">
        {{ t('portal.selectCharacterFromLibrary') }}
      </el-button>
    </div>

    <div v-for="(pose, index) in draft.poses" :key="pose.key || index" class="cp-pose">
      <div class="cp-pose-head">
        <strong>{{ t('portal.poseNumber').replace('{n}', String(index + 1)) }}</strong>
        <el-button link type="danger" size="small" @click="removePose(index)">{{ t('portal.removePose') }}</el-button>
      </div>
      <div class="cp-pose-ref">
        <div class="cp-subtitle">{{ t('portal.poseImage') }}</div>
        <ImageUploader
          :model-value="pose.poseImage ? [pose.poseImage] : []"
          :max="1"
          :show-cover="false"
          :uploader="uploader"
          @update:model-value="setPoseImage(index, $event[0] || null)"
        />
        <el-button link type="primary" :icon="FolderOpened" @click="openPicker('pose', index)">
          {{ t('portal.selectPoseFromLibrary') }}
        </el-button>
      </div>
      <PlatformImageGroups
        :model-value="pose.platformGroups"
        :platforms="platforms"
        :title="t('portal.generatedImages')"
        layout="tabs"
        :uploader="uploader"
        picker-scope="result"
        @update:model-value="setPoseGroups(index, $event)"
      />
    </div>

    <el-button class="cp-add" :icon="Plus" @click="addPose">{{ t('portal.addPose') }}</el-button>

    <ImagePickerDialog v-model="pickerVisible" :scope="pickerScope" :source="source" @select="onPicked" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { FolderOpened, Plus } from '@element-plus/icons-vue'
import type { PromptCharacterPoseInput, PromptImageGroupInput, PromptImageItem, PromptPlatform } from '@/api/prompt'
import ImageUploader from './ImageUploader.vue'
import PlatformImageGroups from './PlatformImageGroups.vue'
import ImagePickerDialog from './ImagePickerDialog.vue'
import { useI18n } from '@/i18n'

const props = withDefaults(
  defineProps<{
    modelValue: PromptCharacterPoseInput
    platforms: PromptPlatform[]
    source?: 'portal' | 'admin'
    uploader?: (file: File) => Promise<{ data: { id: string; url: string } }>
  }>(),
  { source: 'portal', uploader: undefined },
)
const emit = defineEmits<{ (e: 'update:modelValue', value: PromptCharacterPoseInput): void }>()
const { t } = useI18n()

const clone = (value: PromptCharacterPoseInput): PromptCharacterPoseInput => JSON.parse(JSON.stringify(value)) as PromptCharacterPoseInput

const draft = ref<PromptCharacterPoseInput>(clone(props.modelValue))
watch(
  () => props.modelValue,
  (value) => {
    draft.value = clone(value)
  },
  { deep: true },
)

const emitChange = (): void => emit('update:modelValue', clone(draft.value))

const defaultGroup = (): PromptImageGroupInput => ({ platformId: props.platforms[0]?.id ?? 1, images: [] })

const addPose = (): void => {
  draft.value.poses.push({ key: `pose-${Date.now()}`, poseImage: null, platformGroups: [defaultGroup()] })
  emitChange()
}

const removePose = (index: number): void => {
  draft.value.poses.splice(index, 1)
  emitChange()
}

const setCharacterImage = (image: PromptImageItem | null): void => {
  draft.value.characterImage = image
  emitChange()
}

const setPoseImage = (index: number, image: PromptImageItem | null): void => {
  if (!draft.value.poses[index]) return
  draft.value.poses[index].poseImage = image
  emitChange()
}

/** 生成图分组变化（上传/图库选择/增删组）必须显式同步父组件，否则提交时校验与 payload 都是旧数据 */
const setPoseGroups = (index: number, groups: PromptImageGroupInput[]): void => {
  if (!draft.value.poses[index]) return
  draft.value.poses[index].platformGroups = groups
  emitChange()
}

const pickerVisible = ref(false)
const pickerScope = ref<'character' | 'pose'>('character')
const pickerPoseIndex = ref<number | null>(null)

const openPicker = (scope: 'character' | 'pose', poseIndex: number | null = null): void => {
  pickerScope.value = scope
  pickerPoseIndex.value = poseIndex
  pickerVisible.value = true
}

const onPicked = (image: PromptImageItem): void => {
  const picked: PromptImageItem = { url: image.url, filePath: image.filePath ?? null, sort: 0, isCover: false }
  if (pickerScope.value === 'character') setCharacterImage(picked)
  else if (pickerPoseIndex.value !== null) setPoseImage(pickerPoseIndex.value, picked)
  pickerVisible.value = false
}

onMounted(() => {
  if (!draft.value.poses.length) addPose()
})
</script>

<style scoped lang="scss">
.character-pose-editor {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cp-section {
  padding: 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.cp-title,
.cp-subtitle {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
}

.cp-pose {
  padding: 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}

.cp-pose-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.cp-pose-ref {
  margin-bottom: 14px;
}

.cp-add {
  align-self: flex-start;
}
</style>
