<template>
  <el-card shadow="never" class="search-bar">
    <el-form :model="model" inline class="search-form">
      <slot />
      <el-form-item class="search-actions">
        <el-button type="primary" :icon="Search" @click="$emit('search')">查询</el-button>
        <el-button :icon="Refresh" @click="$emit('reset')">重置</el-button>
      </el-form-item>
    </el-form>
    <div v-if="$slots.actions" class="search-extra">
      <slot name="actions" />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { Search, Refresh } from '@element-plus/icons-vue'

defineProps({
  model: {
    type: Object,
    required: true,
  },
})

defineEmits(['search', 'reset'])
</script>

<style lang="scss" scoped>
.search-bar {
  margin-bottom: 16px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--card-bg);
}

.search-bar :deep(.el-card__body) {
  padding: 16px 20px 4px;
}

.search-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
}

.search-form :deep(.el-form-item) {
  margin-bottom: 12px;
  margin-right: 12px;
}

.search-form :deep(.el-form-item__label) {
  font-size: 13px;
  color: var(--text-regular);
  font-weight: 400;
}

.search-actions {
  margin-left: auto;
}

.search-extra {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 4px;
  margin-top: -4px;
}
</style>
