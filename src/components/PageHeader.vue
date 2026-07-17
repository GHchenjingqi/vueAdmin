<template>
  <div class="page-header">
    <div class="page-header-left">
      <h2 class="page-title">
        {{ title }}
      </h2>
      <slot name="extra" />
    </div>
    <div class="page-header-right">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  title: {
    type: String,
    required: true,
  },
})
</script>

<style lang="scss" scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.4;
  position: relative;
  padding-left: 14px;
}

.page-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 18px;
  background: var(--mainColor);
  border-radius: 2px;
}

.page-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
