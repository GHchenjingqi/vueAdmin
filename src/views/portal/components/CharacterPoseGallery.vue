<template>
  <div class="cp-showcase">
    <div v-for="(pose, index) in value.poses" :key="pose.key" class="cp-block">
      <div class="cp-label">{{ t('portal.poseNumber').replace('{n}', String(index + 1)) }}</div>
      <div class="cp-formula">
        <!-- 左侧：上角色图、中「+」、下姿势图 -->
        <div class="cp-inputs">
          <div v-if="value.characterImage" class="cp-input">
            <span class="cp-caption">{{ t('portal.characterImage') }}</span>
            <el-image :src="value.characterImage.url" fit="contain" class="cp-input-image" :preview-src-list="characterUrls" />
          </div>
          <div class="cp-plus">+</div>
          <div v-if="pose.poseImage" class="cp-input">
            <span class="cp-caption">{{ t('portal.poseImage') }}</span>
            <el-image :src="pose.poseImage.url" fit="contain" class="cp-input-image" :preview-src-list="referenceUrls" />
          </div>
        </div>

        <!-- 中间：箭头 -->
        <div class="cp-arrow" aria-hidden="true"></div>

        <!-- 右侧：合成图 -->
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

.cp-formula {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}

/* 左侧输入：角色图 + 姿势图 */
.cp-inputs {
  flex: 0 0 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.cp-input {
  width: 100%;
}

.cp-input-image {
  width: 100%;
  height: 160px;
  display: block;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.cp-plus {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  color: var(--el-color-primary);
}

/* 中间运算符：渐变线条 + 实心箭头 */
.cp-arrow {
  position: relative;
  flex: 0 0 56px;
  height: 3px;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--el-color-primary-light-5), var(--el-color-primary));
}
.cp-arrow::before {
  content: '';
  position: absolute;
  left: -3px;
  top: 50%;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--el-color-primary-light-5);
  transform: translateY(-50%);
}
.cp-arrow::after {
  content: '';
  position: absolute;
  right: -8px;
  top: 50%;
  transform: translateY(-50%);
  border-left: 11px solid var(--el-color-primary);
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
}

.cp-results {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}

.cp-result-image {
  width: 100%;
  height: 180px;
  display: block;
  border-radius: 6px;
}

.cp-caption {
  display: block;
  margin-bottom: 4px;
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
  .cp-formula {
    gap: 8px;
    padding: 8px;
  }

  .cp-inputs {
    flex-basis: 120px;
  }

  .cp-input-image {
    height: 110px;
  }

  .cp-arrow {
    flex-basis: 34px;
  }

  .cp-results {
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  }

  .cp-result-image {
    height: 130px;
  }
}
</style>
