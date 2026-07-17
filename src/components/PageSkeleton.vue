<template>
  <div class="page-skeleton">
    <div class="page-skeleton__header">
      <SkeletonLoader variant="text" width="200px" height="24px" />
      <div class="page-skeleton__actions">
        <SkeletonLoader variant="text" width="100px" height="32px" />
        <SkeletonLoader variant="text" width="80px" height="32px" />
      </div>
    </div>
    <div class="page-skeleton__content">
      <SkeletonLoader variant="table" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 页面骨架屏
 *
 * 用于路由切换时的占位显示，配合 Suspense 使用。
 */
import SkeletonLoader from './SkeletonLoader.vue'
</script>

<style scoped lang="scss">
.page-skeleton {
  padding: 20px;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  &__actions {
    display: flex;
    gap: 12px;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}
</style>
