<template>
  <div ref="viewport" class="canvas-viewport" :class="{ 'is-fullscreen': isFullscreen }" @wheel.prevent="onWheel" @pointerdown="onPointerDown">
    <div v-if="!hasImage" class="canvas-empty">
      <el-icon :size="40"><Picture /></el-icon>
      <p>{{ t('portal.canvasEmptyGroup') }}</p>
    </div>

    <div v-else ref="surface" class="canvas-surface" :style="surfaceStyle">
      <div class="canvas-layout">
        <div v-if="heroImage" class="hero-panel" @pointerdown.stop>
          <el-image
            :src="heroImage.url"
            fit="contain"
            class="hero-image"
            :preview-src-list="heroPreview"
            :initial-index="heroPreviewIndex"
            preview-teleported
            hide-on-click-modal
          />
          <div class="panel-label">{{ t('portal.charGroupTurnarounds') }}</div>
        </div>

        <div class="groups-column">
          <section v-for="group in groups" :key="group.key" class="group-row">
            <div class="group-head">
              <span class="group-mark"></span>
              <span>{{ t(group.titleKey) }}</span>
              <span class="group-count">{{ group.images.length }}</span>
            </div>
            <div class="group-images" @pointerdown.stop>
              <el-image
                v-for="(image, index) in group.images"
                :key="image.url + '-' + index"
                :src="image.url"
                fit="contain"
                class="group-image"
                :preview-src-list="group.preview"
                :initial-index="index"
                preview-teleported
                hide-on-click-modal
              />
            </div>
          </section>
        </div>
      </div>
    </div>

    <div class="canvas-toolbar" @pointerdown.stop>
      <el-button v-if="!isFullscreen" size="small" :icon="FullScreen" @click="enterFullscreen">
        {{ t('portal.canvasFullscreen') }}
      </el-button>
      <el-button v-else size="small" type="primary" :icon="ArrowLeft" @click="exitFullscreen">
        {{ t('portal.canvasExitFullscreen') }}
      </el-button>
    </div>

    <div class="canvas-controls" @pointerdown.stop>
      <el-button size="small" circle :icon="Plus" @click="zoomBy(1.2)" />
      <el-button size="small" circle :icon="Minus" @click="zoomBy(1 / 1.2)" />
      <el-button size="small" circle :icon="Aim" @click="resetView" />
    </div>

    <p class="canvas-tip">{{ t('portal.canvasTip') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Aim, ArrowLeft, FullScreen, Minus, Picture, Plus } from '@element-plus/icons-vue'
import type { PromptCharacterLibrary } from '@/api/prompt'
import { useI18n } from '@/i18n'

const props = defineProps<{ value: PromptCharacterLibrary }>()

const { t } = useI18n()

/** 分组顺序：角色三视图 / 服装三视图 / 发饰特写 / 面部表情 / 道具图 */
const GROUPS = [
  { key: 'turnarounds', titleKey: 'portal.charGroupTurnarounds' },
  { key: 'costumes', titleKey: 'portal.charGroupCostumes' },
  { key: 'hairstyles', titleKey: 'portal.charGroupHairstyles' },
  { key: 'expressions', titleKey: 'portal.charGroupExpressions' },
  { key: 'props', titleKey: 'portal.charGroupProps' },
] as const

type GroupKey = (typeof GROUPS)[number]['key']

const groups = computed(() =>
  GROUPS.map((group) => {
    const images = props.value?.[group.key as GroupKey] ?? []
    return { key: group.key, titleKey: group.titleKey, images, preview: images.map((image) => image.url) }
  }).filter((group) => group.images.length > 0),
)

const hasImage = computed(() => groups.value.some((group) => group.images.length > 0))

/** 主视觉：角色三视图第一张，其次服装三视图第一张，再退到任意分组第一张 */
const heroImage = computed(
  () => props.value?.turnarounds?.[0] ?? props.value?.costumes?.[0] ?? groups.value.find((group) => group.images.length)?.images[0] ?? null,
)
const heroPreview = computed(() => [...(props.value?.turnarounds ?? []).map((i) => i.url), ...(props.value?.costumes ?? []).map((i) => i.url)])
const heroPreviewIndex = computed(() => (heroImage.value ? Math.max(0, heroPreview.value.indexOf(heroImage.value.url)) : 0))

const viewport = ref<HTMLElement | null>(null)
const surface = ref<HTMLElement | null>(null)
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const isFullscreen = ref(false)

const surfaceStyle = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
  transformOrigin: '0 0',
}))

const clampScale = (value: number): number => Math.min(3, Math.max(0.2, value))

const zoomAt = (factor: number, px: number, py: number): void => {
  const next = clampScale(scale.value * factor)
  if (next === scale.value) return
  offsetX.value = px - (px - offsetX.value) * (next / scale.value)
  offsetY.value = py - (py - offsetY.value) * (next / scale.value)
  scale.value = next
}

const zoomBy = (factor: number): void => {
  const rect = viewport.value?.getBoundingClientRect()
  zoomAt(factor, (rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2)
}

const onWheel = (event: WheelEvent): void => {
  const rect = viewport.value?.getBoundingClientRect()
  if (!rect) return
  zoomAt(event.deltaY > 0 ? 1 / 1.1 : 1.1, event.clientX - rect.left, event.clientY - rect.top)
}

/** 视角自适应：让整块画布内容落在可视区域内 */
const fitView = (): void => {
  const vp = viewport.value
  const sf = surface.value
  if (!vp || !sf) return
  const vw = vp.clientWidth
  const vh = vp.clientHeight
  const sw = sf.scrollWidth || sf.offsetWidth
  const sh = sf.scrollHeight || sf.offsetHeight
  if (!sw || !sh) return
  scale.value = clampScale(Math.min((vw - 72) / sw, (vh - 72) / sh, 1))
  offsetX.value = Math.max(24, (vw - sw * scale.value) / 2)
  offsetY.value = 24
}

const resetView = (): void => fitView()

const enterFullscreen = (): void => {
  isFullscreen.value = true
  nextTick(fitView)
}

const exitFullscreen = (): void => {
  isFullscreen.value = false
  nextTick(fitView)
}

let panning = false
let panStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 }

const onPointerDown = (event: PointerEvent): void => {
  panning = true
  panStart = { x: event.clientX, y: event.clientY, offsetX: offsetX.value, offsetY: offsetY.value }
  viewport.value?.setPointerCapture?.(event.pointerId)
}

const onPointerMove = (event: PointerEvent): void => {
  if (!panning) return
  offsetX.value = panStart.offsetX + (event.clientX - panStart.x)
  offsetY.value = panStart.offsetY + (event.clientY - panStart.y)
}

const onPointerUp = (): void => {
  panning = false
}

onMounted(() => {
  viewport.value?.addEventListener('pointermove', onPointerMove)
  viewport.value?.addEventListener('pointerup', onPointerUp)
  viewport.value?.addEventListener('pointercancel', onPointerUp)
  nextTick(fitView)
})

onBeforeUnmount(() => {
  viewport.value?.removeEventListener('pointermove', onPointerMove)
  viewport.value?.removeEventListener('pointerup', onPointerUp)
  viewport.value?.removeEventListener('pointercancel', onPointerUp)
})
</script>

<style scoped>
.canvas-viewport {
  position: relative;
  height: 620px;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background:
    radial-gradient(circle, rgba(128, 128, 128, 0.18) 1px, transparent 1px) 0 0 / 22px 22px,
    var(--page-bg);
  overflow: hidden;
  cursor: grab;
  touch-action: none;
}
.canvas-viewport:active {
  cursor: grabbing;
}
.canvas-viewport.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 2500;
  width: 100vw;
  height: 100vh;
  border-radius: 0;
  border: none;
}

.canvas-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--ink-3);
  font-size: 13px;
}
.canvas-empty p {
  margin: 0;
}

.canvas-surface {
  position: absolute;
  top: 0;
  left: 0;
  width: max-content;
}
.canvas-layout {
  display: flex;
  align-items: flex-start;
  gap: 36px;
  padding: 36px;
}

.hero-panel {
  flex: 0 0 340px;
  width: 340px;
}
.hero-image {
  width: 340px;
  height: 640px;
  display: block;
  border-radius: 10px;
  background: transparent;
}
.panel-label {
  margin-top: 10px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
}

.groups-column {
  display: flex;
  flex-direction: column;
  gap: 26px;
}
.group-row {
  min-width: 0;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}
.group-mark {
  width: 4px;
  height: 14px;
  border-radius: 2px;
  background: var(--brand);
}
.group-count {
  font-size: 11px;
  font-weight: 500;
  color: var(--ink-3);
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  padding: 1px 8px;
}
.group-images {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
}
.group-image {
  flex: 0 0 auto;
  width: 84px;
  height: 112px;
  display: block;
  border-radius: 0;
  background: transparent;
}
.group-empty {
  padding: 16px 0;
  font-size: 12px;
  color: var(--ink-3);
}

.canvas-toolbar {
  position: absolute;
  left: 14px;
  top: 14px;
  z-index: 5;
}
.canvas-controls {
  position: absolute;
  right: 14px;
  bottom: 14px;
  display: flex;
  gap: 6px;
  z-index: 5;
}
.canvas-tip {
  position: absolute;
  left: 14px;
  bottom: 14px;
  margin: 0;
  font-size: 11px;
  color: var(--ink-3);
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  padding: 4px 12px;
  z-index: 5;
}

@media (max-width: 900px) {
  .canvas-viewport {
    height: 480px;
  }
}
</style>
