<template>
  <div class="skeleton-loader" :class="[variant]" :style="{ width, height }">
    <div class="skeleton-pulse" />
  </div>
</template>

<script setup lang="ts">
/**
 * 骨架屏组件
 *
 * 用于页面加载时的占位显示，消除白屏体验。
 * 支持多种变体：文本、卡片、表格、圆形。
 */
defineProps<{
  variant?: 'text' | 'card' | 'table' | 'circle'
  width?: string
  height?: string
}>()
</script>

<style scoped lang="scss">
.skeleton-loader {
  position: relative;
  overflow: hidden;
  background: var(--el-fill-color-light);
  border-radius: 4px;

  &.text {
    height: 16px;
    width: 100%;
  }

  &.card {
    height: 120px;
    width: 100%;
    border-radius: 8px;
  }

  &.table {
    height: 300px;
    width: 100%;
  }

  &.circle {
    border-radius: 50%;
  }
}

.skeleton-pulse {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, var(--el-fill-color-blank) 50%, transparent);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
</style>
