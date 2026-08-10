<template>
  <div v-loading="loading" class="virtual-table-wrapper">
    <AutoResizer v-if="autoResize" @resize="onResize">
      <ElTableV2
        ref="tableRef"
        :columns="v2Columns"
        :data="data"
        :row-height="rowHeight"
        :width="tableWidth as any"
        :height="tableHeight as any"
        :row-key="props.rowKey as any"
        :sort-by="props.sortBy as any"
        :sort-state="props.sortState as any"
        @column-sort="handleColumnSort as any"
      >
        <template v-if="$slots.overlay" #overlay>
          <slot name="overlay" />
        </template>
      </ElTableV2>
    </AutoResizer>
    <ElTableV2
      v-else
      ref="tableRef"
      :columns="v2Columns"
      :data="data"
      :row-height="rowHeight"
      :width="tableWidth as any"
      :height="tableHeight as any"
      :row-key="props.rowKey as any"
      :sort-by="props.sortBy as any"
      :sort-state="props.sortState as any"
      @column-sort="handleColumnSort as any"
    >
      <template v-if="$slots.overlay" #overlay>
        <slot name="overlay" />
      </template>
    </ElTableV2>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElTableV2 } from 'element-plus'
import type { Column } from 'element-plus'

interface ColumnDef {
  prop: string
  label: string
  width?: number
  minWidth?: number
  align?: 'left' | 'center' | 'right'
  fixed?: boolean | 'left' | 'right' | true
  sortable?: boolean
  formatter?: (row: Record<string, unknown>, column: ColumnDef) => string
}

const props = withDefaults(
  defineProps<{
    columns: ColumnDef[]
    data: Record<string, unknown>[]
    rowHeight?: number
    width?: number
    height?: number
    autoResize?: boolean
    rowKey?: string
    fixed?: boolean
    sortBy?: Record<string, string>
    sortState?: Record<string, string>
    loading?: boolean
  }>(),
  {
    rowHeight: 50,
    width: 800,
    height: 600,
    autoResize: false,
    rowKey: 'id',
    fixed: false,
    loading: false,
    sortBy: () => ({}),
    sortState: () => ({}),
  },
)

const emit = defineEmits<{
  (e: 'column-sort', params: { column: ColumnDef; key: string; order: string }): void
}>()

const tableRef = ref()
const tableWidth = ref(props.width)
const tableHeight = ref(props.height)

const onResize = ({ width, height }: { width: number; height: number }) => {
  tableWidth.value = width
  tableHeight.value = height
}

const handleColumnSort = (params: { column: { key: string }; key: string; order: string }) => {
  const originalCol = props.columns.find((c) => c.prop === params.key)
  if (originalCol) {
    emit('column-sort', { column: originalCol, key: params.key, order: params.order })
  }
}

const v2Columns = computed(() => {
  return props.columns.map((col) => ({
    key: col.prop,
    dataKey: col.prop,
    title: col.label,
    width: col.width ?? col.minWidth ?? 120,
    align: col.align ?? 'left',
    fixed: (col.fixed === true ? 'left' : col.fixed === false ? undefined : col.fixed) as 'left' | 'right' | undefined,
    sortable: col.sortable ?? false,
    cellRenderer: col.formatter
      ? ({ cellData }: { cellData: unknown }) => {
          const row = {} as Record<string, unknown>
          row[col.prop] = cellData
          return col.formatter!(row, col)
        }
      : undefined,
  })) as Column<Record<string, unknown>>[]
})

defineExpose({ tableRef })
</script>

<style lang="scss" scoped>
.virtual-table-wrapper {
  width: 100%;
  height: 100%;
  min-height: 300px;
}
</style>
