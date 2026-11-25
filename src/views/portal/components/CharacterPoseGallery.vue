<template>
  <div class="cp-showcase">
    <div v-if="value.characterImage" class="cp-character">
      <div class="cp-label">{{ t('portal.characterImage') }}</div>
      <el-image :src="value.characterImage.url" fit="contain" class="cp-character-image" :preview-src-list="characterUrls" />
    </div>

    <div v-for="(pose, index) in value.poses" :key="pose.key" class="cp-block">
      <div class="cp-label">{{ t('portal.poseNumber').replace('{n}', String(index + 1)) }}</div>
      <div class="cp-row">
        <div v-if="pose.poseImage" class="cp-reference">
          <el-image :src="pose.poseImage.url" fit="contain" class="cp-reference-image" :preview-src-list="referenceUrls" />
          <span class="cp-caption">{{ t('portal.poseImage') }}</span>
        </div>
        <div class="cp-results">
          <el-image
            v-for="image in resultImages(pose)"
            :key="image.url"
            :src="image.url"
            fit="cover"
            class="cp-result-image"
            :preview-src-list="resultUrls(pose)"
          />
          <div v-if="!resultImages(pose).length" class="cp-empty">{{ t('portal.generatedEmpty') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PromptCharacterPose, PromptPose } from '@/api/prompt'
import { useI18n } from '@/i18n'

const props = defineProps<{ value: PromptCharacterPose }>()
const { t } = useI18n()

const characterUrls = computed(() => (props.value.characterImage ? [props.value.characterImage.url] : []))
const referenceUrls = computed(() => props.value.poses.map((pose) => pose.poseImage?.url).filter(Boolean) as string[])

const resultImages = (pose: PromptPose) => pose.platformGroups.flatMap((group) => group.images)
const resultUrls = (pose: PromptPose) => resultImages(pose).map((image) => image.url)
</script>

<style scoped lang="scss">
.cp-showcase {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.cp-label {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}

.cp-character-image,
.cp-reference-image {
  width: 100%;
  max-height: 420px;
  display: block;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}

.cp-character-image {
  height: 320px;
}

.cp-reference-image {
  height: 260px;
}

.cp-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.cp-reference {
  flex: 0 0 34%;
}

.cp-results {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}

.cp-result-image {
  width: 100%;
  height: 200px;
  display: block;
  border-radius: 6px;
}

.cp-caption {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

.cp-empty {
  grid-column: 1 / -1;
  padding: 40px 0;
  text-align: center;
  color: var(--el-text-color-secondary);
}

@media (max-width: 900px) {
  .cp-row {
    flex-direction: column;
  }

  .cp-reference {
    flex-basis: auto;
    width: 100%;
  }
}
</style>
