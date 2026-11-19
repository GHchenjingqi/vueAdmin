<template>
  <div class="step-editor">
    <div class="anchor-card">
      <label class="field-label">{{ t('portal.characterAnchor') }}</label>
      <el-input
        :model-value="characterAnchor"
        type="textarea"
        :rows="3"
        :placeholder="t('portal.characterAnchorPlaceholder')"
        @update:model-value="emit('update:characterAnchor', String($event))"
      />
      <p class="field-tip">{{ t('portal.characterAnchorTip') }}</p>
    </div>

    <div v-for="(step, index) in steps" :key="index" class="step-card">
      <div class="step-head">
        <span class="step-badge">{{ index + 1 }}</span>
        <span class="step-head-title">{{ t('portal.step') }} {{ index + 1 }}</span>
        <div class="step-head-actions">
          <el-button link :disabled="index === 0" :icon="ArrowUp" @click="move(index, -1)" />
          <el-button link :disabled="index === steps.length - 1" :icon="ArrowDown" @click="move(index, 1)" />
          <el-button link type="danger" :icon="Delete" @click="remove(index)" />
        </div>
      </div>

      <div class="step-grid">
        <el-form-item :label="t('portal.stepName')" required>
          <el-input
            :model-value="step.name"
            maxlength="100"
            :placeholder="t('portal.stepNamePlaceholder')"
            @update:model-value="update(index, 'name', String($event))"
          />
        </el-form-item>
        <el-form-item :label="t('portal.stepSeconds')">
          <el-input-number
            :model-value="step.seconds"
            :min="1"
            :max="600"
            :placeholder="t('portal.stepSeconds')"
            controls-position="right"
            @update:model-value="update(index, 'seconds', $event)"
          />
        </el-form-item>
      </div>

      <el-form-item :label="t('portal.stepPrompt')" required>
        <el-input
          :model-value="step.actionPrompt"
          type="textarea"
          :rows="3"
          :placeholder="t('portal.stepPromptPlaceholder')"
          @update:model-value="update(index, 'actionPrompt', String($event))"
        />
      </el-form-item>

      <div class="step-grid">
        <el-form-item :label="t('portal.stepCamera')">
          <el-input
            :model-value="step.camera || ''"
            maxlength="200"
            :placeholder="t('portal.stepCameraPlaceholder')"
            @update:model-value="update(index, 'camera', String($event))"
          />
        </el-form-item>
        <el-form-item :label="t('portal.stepTransition')">
          <el-input
            :model-value="step.transition || ''"
            maxlength="200"
            :placeholder="t('portal.stepTransitionPlaceholder')"
            @update:model-value="update(index, 'transition', String($event))"
          />
        </el-form-item>
      </div>

      <div class="step-images">
        <label class="field-label">{{ t('portal.stepImages') }}</label>
        <PlatformImageGroups :model-value="step.platformGroups" :platforms="platforms" :max="1" @update:model-value="update(index, 'platformGroups', $event)" />
      </div>
    </div>

    <el-button class="add-step" :disabled="steps.length >= 100" @click="add">+ {{ t('portal.addStep') }}</el-button>
  </div>
</template>

<script setup lang="ts">
import { ArrowUp, ArrowDown, Delete } from '@element-plus/icons-vue'
import type { PromptPlatform, PromptStepInput } from '@/api/prompt'
import PlatformImageGroups from './PlatformImageGroups.vue'
import { useI18n } from '@/i18n'

const props = defineProps<{ steps: PromptStepInput[]; characterAnchor: string; platforms: PromptPlatform[] }>()
const emit = defineEmits<{
  (e: 'update:steps', value: PromptStepInput[]): void
  (e: 'update:characterAnchor', value: string): void
}>()

const { t } = useI18n()

const emptyStep = (): PromptStepInput => ({
  name: '',
  actionPrompt: '',
  camera: null,
  seconds: 5,
  transition: null,
  platformGroups: props.platforms.length ? [{ platformId: props.platforms[0].id, images: [] }] : [],
})

const update = (index: number, key: keyof PromptStepInput, value: unknown): void => {
  const next = props.steps.map((step, i) => (i === index ? { ...step, [key]: value } : step))
  emit('update:steps', next)
}

const add = (): void => {
  emit('update:steps', [...props.steps, emptyStep()])
}

const remove = (index: number): void => {
  emit(
    'update:steps',
    props.steps.filter((_, i) => i !== index),
  )
}

const move = (index: number, direction: -1 | 1): void => {
  const target = index + direction
  if (target < 0 || target >= props.steps.length) return
  const next = [...props.steps]
  ;[next[index], next[target]] = [next[target], next[index]]
  emit('update:steps', next)
}
</script>

<style scoped>
.step-editor {
  width: 100%;
}

.anchor-card {
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid var(--line);
  background: var(--brand-soft);
  border-radius: var(--radius);
}

.field-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
}

.field-tip {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-3);
}

.step-card {
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid var(--line);
  background: var(--card-bg);
  border-radius: var(--radius);
}

.step-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.step-badge {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.step-head-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-1);
}

.step-head-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
}

.step-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.step-images {
  margin-top: 4px;
}

.step-images :deep(.platform-group) {
  padding: 10px;
}

.add-step {
  width: 100%;
  border-style: dashed;
  color: var(--brand);
  border-color: var(--brand);
}

@media (max-width: 640px) {
  .step-grid {
    grid-template-columns: 1fr;
  }
}
</style>
