<template>
  <div class="sequence-timeline">
    <!-- 套组信息卡 -->
    <div class="seq-info-card">
      <div class="seq-info-top">
        <div>
          <span class="seq-badge">{{ t('portal.sequenceBadge') }} · {{ t('portal.stepCount').replace('{n}', String(steps.length)) }}</span>
          <p class="seq-summary">{{ t('portal.copySequenceHint') }} · {{ totalSeconds }}s</p>
        </div>
        <div class="seq-actions">
          <el-button :icon="isPlaying ? VideoPause : VideoPlay" @click="togglePlay">
            {{ isPlaying ? t('portal.stopDemo') : t('portal.playDemo') }}
          </el-button>
          <el-button type="primary" :icon="DocumentCopy" @click="copyAll">{{ t('portal.copyAll') }}</el-button>
        </div>
      </div>
      <div v-if="detail.characterAnchor" class="anchor-strip">
        <span class="anchor-label">{{ t('portal.characterAnchor') }}</span>
        <span class="anchor-text">{{ detail.characterAnchor }}</span>
      </div>
    </div>

    <!-- 步骤时间轴 -->
    <div class="timeline">
      <div v-for="(step, index) in steps" :key="step.id" class="timeline-step" :class="{ active: index === activeStep }">
        <div class="timeline-rail">
          <span class="timeline-dot">{{ index + 1 }}</span>
          <span v-if="index < steps.length - 1" class="timeline-line" />
        </div>
        <div class="step-body">
          <div class="step-title-row">
            <h3 class="step-name">{{ step.name }}</h3>
            <span v-if="step.seconds" class="step-seconds">{{ step.seconds }}s</span>
            <el-button class="step-copy" link size="small" :icon="DocumentCopy" @click="copyStep(index)">{{ t('portal.copyStep') }}</el-button>
          </div>

          <div class="step-columns">
            <div class="step-image-wrap">
              <div v-if="step.platformGroups.length > 1" class="step-platforms">
                <button
                  v-for="(group, gi) in step.platformGroups"
                  :key="group.platformId"
                  type="button"
                  class="step-platform-tab"
                  :class="{ active: gi === (platformIndex[step.id] || 0) }"
                  @click="selectPlatform(step.id, gi)"
                >
                  {{ group.platformName }}
                </button>
              </div>
              <div class="step-frame">
                <el-image
                  v-if="activeImage(step)"
                  :src="activeImage(step)"
                  fit="contain"
                  class="step-image"
                  :preview-src-list="step.platformGroups.map((g) => g.images[0]?.url).filter(Boolean) as string[]"
                />
                <div v-else class="step-placeholder">
                  <el-icon :size="28"><Picture /></el-icon>
                </div>
              </div>
            </div>

            <div class="step-detail">
              <div class="step-field">
                <span class="field-key">{{ t('portal.stepPrompt') }}</span>
                <pre class="field-value prompt-text">{{ composeStepPrompt(step) }}</pre>
              </div>
              <div v-if="step.camera" class="step-field">
                <span class="field-key">{{ t('portal.stepCamera') }}</span>
                <span class="field-value">{{ step.camera }}</span>
              </div>
              <div v-if="step.transition" class="step-field">
                <span class="field-key">{{ t('portal.stepTransition') }}</span>
                <span class="field-value">{{ step.transition }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { DocumentCopy, VideoPlay, VideoPause, Picture } from '@element-plus/icons-vue'
import type { PortalPrompt } from '@/api/portal'
import type { PromptStep } from '@/api/prompt'
import { useI18n } from '@/i18n'
import { copyText } from '@/utils/clipboard'

const props = defineProps<{ detail: PortalPrompt }>()
const { t } = useI18n()

const steps = computed<PromptStep[]>(() => props.detail.steps || [])
const totalSeconds = computed(() => steps.value.reduce((sum, step) => sum + (step.seconds || 0), 0))
const platformIndex = reactive<Record<number, number>>({})
const activeStep = ref(-1)
const isPlaying = ref(false)
let playTimer: ReturnType<typeof setInterval> | null = null

const activeImage = (step: PromptStep): string => {
  const group = step.platformGroups[platformIndex[step.id] || 0]
  return group?.images[0]?.url || ''
}

const selectPlatform = (stepId: number, index: number): void => {
  platformIndex[stepId] = index
}

const composeStepPrompt = (step: PromptStep): string => {
  const anchor = props.detail.characterAnchor?.trim()
  const parts = [step.actionPrompt]
  if (step.camera?.trim()) parts.push(step.camera.trim())
  const action = parts.join('，')
  return anchor ? `${anchor}，${action}` : action
}

const composeAll = (): string => {
  const lines: string[] = []
  if (props.detail.characterAnchor?.trim()) {
    lines.push(`${t('portal.characterAnchor')}：${props.detail.characterAnchor.trim()}`)
    lines.push('')
  }
  steps.value.forEach((step, index) => {
    lines.push(`${index + 1}. ${step.name}${step.seconds ? ` (${step.seconds}s)` : ''}`)
    lines.push(composeStepPrompt(step))
    if (step.transition?.trim()) lines.push(`${t('portal.stepTransition')}：${step.transition.trim()}`)
    lines.push('')
  })
  return lines.join('\n').trim()
}

const copyAll = async (): Promise<void> => {
  try {
    await copyText(composeAll())
    ElMessage.success(t('portal.copySuccess'))
  } catch {
    ElMessage.error(t('portal.copyFailed'))
  }
}

const copyStep = async (index: number): Promise<void> => {
  try {
    await copyText(composeStepPrompt(steps.value[index]))
    ElMessage.success(t('portal.copySuccess'))
  } catch {
    ElMessage.error(t('portal.copyFailed'))
  }
}

const stopPlay = (): void => {
  if (playTimer) clearInterval(playTimer)
  playTimer = null
  isPlaying.value = false
  activeStep.value = -1
}

const togglePlay = (): void => {
  if (isPlaying.value) {
    stopPlay()
    return
  }
  if (!steps.value.length) return
  isPlaying.value = true
  activeStep.value = 0
  playTimer = setInterval(() => {
    const next = activeStep.value + 1
    if (next >= steps.value.length) {
      stopPlay()
      return
    }
    activeStep.value = next
    document.querySelector('.timeline-step.active')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 1600)
}

onBeforeUnmount(stopPlay)
</script>

<style scoped>
.sequence-timeline {
  width: 100%;
}

.seq-info-card {
  padding: 16px 20px;
  margin-bottom: 12px;
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: 8px;
}

.seq-info-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.seq-badge {
  display: inline-block;
  margin-bottom: 6px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--brand);
  background: var(--brand-soft);
  border-radius: 4px;
}

.seq-summary {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ink-3);
}

.seq-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.anchor-strip {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--brand-soft);
  border-radius: 4px;
}

.anchor-label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--brand);
}

.anchor-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-2);
}

.timeline {
  width: 100%;
}

.timeline-step {
  display: flex;
  gap: 14px;
}

.timeline-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 28px;
}

.timeline-dot {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--card-bg);
  border: 1px solid var(--line-strong);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s;
}

.timeline-step.active .timeline-dot {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}

.timeline-line {
  flex: 1;
  width: 1px;
  min-height: 24px;
  background: var(--line);
  margin: 4px 0;
}

.step-body {
  flex: 1;
  min-width: 0;
  padding: 14px 16px;
  margin-bottom: 12px;
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: 8px;
  transition: border-color 0.2s;
}

.timeline-step.active .step-body {
  border-color: var(--brand);
}

.step-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.step-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink-1);
}

.step-seconds {
  padding: 2px 7px;
  font-size: 11px;
  color: var(--ink-3);
  background: var(--page-bg);
  border-radius: 4px;
}

.step-copy {
  margin-left: auto;
}

.step-columns {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 16px;
}

.step-platforms {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.step-platform-tab {
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--card-bg);
  color: var(--ink-2);
  font-size: 11px;
  cursor: pointer;
}

.step-platform-tab.active {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--brand-soft);
}

.step-frame {
  height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--page-bg);
  border-radius: 4px;
}

.step-image {
  width: 100%;
  height: 100%;
}

.step-placeholder {
  color: var(--ink-3);
}

.step-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.step-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field-key {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-3);
}

.field-value {
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-2);
}

.prompt-text {
  margin: 0;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--page-bg);
  border-radius: 4px;
  font-family: var(--sans);
}

@media (max-width: 900px) {
  .step-columns {
    grid-template-columns: 1fr;
  }

  .step-frame {
    height: 240px;
  }
}
</style>
