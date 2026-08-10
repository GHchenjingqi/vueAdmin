<template>
  <el-card shadow="never" class="table-card">
    <template v-if="title || $slots.header" #header>
      <div class="table-card-header">
        <span v-if="title" class="table-card-title">{{ title }}</span>
        <slot name="header" />
      </div>
    </template>
    <slot />
    <div v-if="showPagination" class="table-card-pagination">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="currentPageSize"
        :total="total"
        :page-sizes="pageSizes"
        :layout="layout"
        background
        @size-change="$emit('size-change', $event)"
        @current-change="$emit('current-change', $event)"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
const props = defineProps({
  title: { type: String, default: '' },
  total: { type: Number, default: 0 },
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 10 },
  pageSizes: { type: Array as () => number[], default: () => [10, 20, 50] },
  layout: { type: String, default: 'total, sizes, prev, pager, next, jumper' },
  showPagination: { type: Boolean, default: true },
})

const emit = defineEmits(['update:page', 'update:pageSize', 'size-change', 'current-change'])

const currentPage = computed({
  get: () => props.page,
  set: (v) => {
    emit('update:page', v)
    emit('current-change', v)
  },
})

const currentPageSize = computed({
  get: () => props.pageSize,
  set: (v) => {
    emit('update:pageSize', v)
    emit('size-change', v)
  },
})
</script>

<style lang="scss" scoped>
.table-card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--card-bg);
}

.table-card :deep(.el-card__header) {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-light);
  background: var(--card-header-bg);
}

.table-card :deep(.el-card__body) {
  padding: 0;
}

.table-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.table-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.table-card-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border-light);
}
</style>
