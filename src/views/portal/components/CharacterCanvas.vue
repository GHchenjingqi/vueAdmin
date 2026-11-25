<template>
  <div ref="viewport" class="canvas-viewport" @wheel.prevent="onWheel" @pointerdown="onBackgroundPointerDown">
    <div class="canvas-surface" :style="surfaceStyle">
      <div
        v-for="(group, index) in groups"
        :key="group.key"
        class="canvas-node"
        :class="{ dragging: draggingNode === group.key }"
        :style="{ left: `${positions[group.key]?.x ?? 0}px`, top: `${positions[group.key]?.y ?? 0}px` }"
        @pointerdown.stop="onNodePointerDown($event, group.key)"
      >
        <div class="canvas-node-head" :class="`node-head-${index % 4}`">
          <span class="canvas-node-title">{{ t(group.titleKey) }}</span>
          <span class="canvas-node-count">{{ group.images.length }}</span>
        </div>
        <div class="canvas-node-body" @pointerdown.stop>
          <template v-if="group.images.length">
            <el-image
              v-for="(image, imgIndex) in group.images"
              :key="image.url + imgIndex"
              :src="image.url"
              fit="cover"
              class="canvas-image"
              :preview-src-list="group.images.map((img) => img.url)"
              :initial-index="imgIndex"
              preview-teleported
              hide-on-click-modal
            />
          </template>
          <div v-else class="canvas-node-empty">{{ t('portal.canvasEmptyGroup') }}</div>
        </div>
      </div>
    </div>

    <div class="canvas-controls">
      <el-button size="small" circle :icon="Plus" @click.stop="zoomBy(0.2)" />
      <el-button size="small" circle :icon="Minus" @click.stop="zoomBy(-0.2)" />
      <el-button size="small" circle :icon="Aim" @click.stop="resetView" />
    </div>
    <p class="canvas-tip">{{ t('portal.canvasTip') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Aim, Minus, Plus } from '@element-plus/icons-vue'
import type { PromptCharacterLibrary } from '@/api/prompt'
import { useI18n } from '@/i18n'

const props = defineProps<{ value: PromptCharacterLibrary }>()

const { t } = useI18n()

const GROUPS = [
  { key: 'turnarounds', titleKey: 'portal.charGroupTurnarounds' },
  { key: 'costumes', titleKey: 'portal.charGroupCostumes' },
  { key: 'hairstyles', titleKey: 'portal.charGroupHairstyles' },
  { key: 'props', titleKey: 'portal.charGroupProps' },
] as const

type GroupKey = (typeof GROUPS)[number]['key']

const groups = computed(() =>
  GROUPS.map((group) => ({
    key: group.key as GroupKey,
    titleKey: group.titleKey,
    images: props.value[group.key] ?? [],
  })),
)

const viewport = ref<HTMLElement | null>(null)
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)

/** 初始布局：四组卡片横向排开，纵向交错 */
const positions = reactive<Record<GroupKey, { x: number; y: number }>>({
  turnarounds: { x: 0, y: 0 },
  costumes: { x: 340, y: 60 },
  hairstyles: { x: 680, y: 0 },
  props: { x: 1020, y: 60 },
})

const surfaceStyle = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
  transformOrigin: '0 0',
}))

const clampScale = (value: number): number => Math.min(2, Math.max(0.3, value))

const zoomBy = (delta: number): void => {
  scale.value = clampScale(scale.value + delta)
}

const resetView = (): void => {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
}

const onWheel = (event: WheelEvent): void => {
  const delta = event.deltaY > 0 ? -0.08 : 0.08
  scale.value = clampScale(scale.value + delta)
}

let panning = false
let panStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 }

const onBackgroundPointerDown = (event: PointerEvent): void => {
  panning = true
  panStart = { x: event.clientX, y: event.clientY, offsetX: offsetX.value, offsetY: offsetY.value }
  viewport.value?.setPointerCapture?.(event.pointerId)
}

let dragNode: GroupKey | null = null
let dragStart = { x: 0, y: 0, nodeX: 0, nodeY: 0 }

const onNodePointerDown = (event: PointerEvent, key: GroupKey): void => {
  dragNode = key
  draggingNode.value = key
  dragStart = { x: event.clientX, y: event.clientY, nodeX: positions[key].x, nodeY: positions[key].y }
  viewport.value?.setPointerCapture?.(event.pointerId)
}

const draggingNode = ref<GroupKey | null>(null)

const onPointerMove = (event: PointerEvent): void => {
  if (dragNode) {
    const dx = (event.clientX - dragStart.x) / scale.value
    const dy = (event.clientY - dragStart.y) / scale.value
    positions[dragNode] = { x: Math.round(dragStart.nodeX + dx), y: Math.round(dragStart.nodeY + dy) }
  } else if (panning) {
    offsetX.value = panStart.offsetX + (event.clientX - panStart.x)
    offsetY.value = panStart.offsetY + (event.clientY - panStart.y)
  }
}

const onPointerUp = (): void => {
  panning = false
  dragNode = null
  draggingNode.value = null
}

onMounted(() => {
  viewport.value?.addEventListener('pointermove', onPointerMove)
  viewport.value?.addEventListener('pointerup', onPointerUp)
  viewport.value?.addEventListener('pointercancel', onPointerUp)
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
.canvas-surface {
  position: absolute;
  inset: 0;
}
.canvas-node {
  position: absolute;
  width: 300px;
  border-radius: 10px;
  background: var(--card-bg);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-sm);
  cursor: move;
  user-select: none;
}
.canvas-node.dragging {
  opacity: 0.85;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
}
.canvas-node-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 10px 10px 0 0;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.node-head-0 {
  background: var(--brand);
}
.node-head-1 {
  background: #8b5cf6;
}
.node-head-2 {
  background: #ec4899;
}
.node-head-3 {
  background: #f59e0b;
}
.canvas-node-count {
  font-size: 11px;
  background: rgba(255, 255, 255, 0.25);
  border-radius: var(--radius-pill);
  padding: 1px 8px;
}
.canvas-node-body {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 10px 12px 12px;
  cursor: default;
}
.canvas-image {
  width: 100%;
  height: 110px;
  border-radius: 6px;
  display: block;
}
.canvas-node-empty {
  grid-column: 1 / -1;
  padding: 26px 0;
  text-align: center;
  font-size: 12px;
  color: var(--ink-3);
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
</style>
