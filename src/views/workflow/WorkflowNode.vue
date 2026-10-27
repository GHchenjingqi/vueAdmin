<template>
  <div :class="['wf-node', `wf-node--${type}`, { 'is-selected': selected }]">
    <div class="wf-node__head">
      <el-icon class="wf-node__icon">
        <component :is="icon" />
      </el-icon>
      <span class="wf-node__label">{{ data?.label || type }}</span>
    </div>
    <div v-if="type === 'approve' && approverCount > 0" class="wf-node__badge">
      {{ approverCount }}
    </div>

    <Handle v-if="type !== 'start'" type="target" :position="Position.Left" />

    <Handle v-if="type !== 'end' && type !== 'condition'" type="source" :position="Position.Right" />

    <template v-if="type === 'condition'">
      <Handle id="true" type="source" :position="Position.Right" class="wf-handle--true" />
      <Handle id="false" type="source" :position="Position.Bottom" class="wf-handle--false" />
      <span class="wf-branch-label wf-branch-label--true">真</span>
      <span class="wf-branch-label wf-branch-label--false">假</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, h } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { CircleCheckFilled, CircleCloseFilled, Aim, EditPen, Bell } from '@element-plus/icons-vue'
import type { Component } from 'vue'

const props = defineProps<{
  id: string
  type: string
  data?: { label?: string; approverCount?: number; rawNode?: { type: string } }
  selected?: boolean
}>()

const iconMap: Record<string, Component> = {
  start: CircleCheckFilled,
  end: CircleCloseFilled,
  condition: Aim,
  approve: EditPen,
  notify: Bell,
}

const icon = computed(() => iconMap[props.type] ?? h(EditPen))
const approverCount = computed(() => Number(props.data?.approverCount) || 0)
</script>

<style lang="scss" scoped>
.wf-node {
  position: relative;
  min-width: 120px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 2px solid var(--el-border-color);
  background: var(--el-bg-color);
  font-size: 13px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  transition:
    border-color 0.15s,
    box-shadow 0.15s;

  &.is-selected {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 2px var(--el-color-primary-light-7);
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  &__icon {
    font-size: 16px;
  }
  &__badge {
    position: absolute;
    top: -8px;
    right: -8px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--el-color-primary);
    color: #fff;
    font-size: 11px;
    line-height: 18px;
    text-align: center;
  }

  &--start {
    border-color: var(--el-color-success);
    background: var(--el-color-success-light-9);
    border-radius: 24px;
  }
  &--end {
    border-color: var(--el-color-danger);
    background: var(--el-color-danger-light-9);
    border-radius: 24px;
  }
  &--approve {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
  }
  &--condition {
    border-color: var(--el-color-warning);
    background: var(--el-color-warning-light-9);
    transform: rotate(0deg);
  }
  &--notify {
    border-color: var(--el-color-info);
    background: var(--el-color-info-light-9);
  }
}

.wf-branch-label {
  position: absolute;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  background: var(--el-bg-color);
  padding: 0 2px;
  &--true {
    right: -10px;
    top: 50%;
    transform: translate(100%, -50%);
  }
  &--false {
    left: 50%;
    bottom: -16px;
    transform: translateX(-50%);
  }
}
</style>

<style>
.wf-handle--true,
.wf-handle--false {
  width: 10px;
  height: 10px;
  background: var(--el-color-warning);
}
</style>
