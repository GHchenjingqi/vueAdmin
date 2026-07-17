<template>
  <div v-if="showPagination" class="table-pagination">
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="currentPageSize"
      :total="total"
      :page-sizes="pageSizes"
      layout="total, sizes, prev, pager, next, jumper"
      background
    />
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    total: number
    page: number
    pageSize: number
    pageSizes?: number[]
    showPagination?: boolean
  }>(),
  {
    pageSizes: () => [10, 20, 50, 100],
    showPagination: true,
  },
)

const emit = defineEmits<{
  'update:page': [value: number]
  'update:pageSize': [value: number]
}>()

const currentPage = computed({
  get: () => props.page,
  set: (val: number) => emit('update:page', val),
})

const currentPageSize = computed({
  get: () => props.pageSize,
  set: (val: number) => emit('update:pageSize', val),
})
</script>

<style lang="scss" scoped>
.table-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border-light);
}
</style>
