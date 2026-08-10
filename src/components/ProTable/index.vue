<template>
  <div class="pro-table">
    <!-- 搜索区域 -->
    <SearchForm
      v-if="searchFields?.length"
      :search-fields="searchFields"
      :search-model="localSearchParams"
      :show-search="showSearch"
      :loading="loading"
      @search="handleQuery"
      @reset="handleReset"
    />

    <!-- 导出进度条 -->
    <div v-if="exporting" class="export-progress">
      <div class="export-progress-inner">
        <el-icon class="is-loading">
          <Loading />
        </el-icon>
        <span class="export-progress-text">{{ exportStatusText }}</span>
        <el-progress v-if="exportPercent !== undefined && exportPercent > 0" :percentage="exportPercent" :stroke-width="6" style="flex: 1; max-width: 300px" />
      </div>
    </div>

    <!-- 表格卡片 -->
    <el-card shadow="never" class="table-card" :style="modelType === 'dialog' ? { marginTop: '-35px' } : {}">
      <template #header>
        <div class="table-header-row">
          <div class="table-header-left q-title">
            <slot name="header-title">
              {{ title }}
            </slot>
          </div>
          <div class="table-header-right">
            <slot name="header-buttons" />
            <el-tooltip v-if="searchFields?.length" :content="showSearch ? t('common.hideSearch') : t('common.showSearch')" placement="top">
              <el-button text :icon="Search" size="small" class="search-toggle-btn" circle @click="showSearch = !showSearch" />
            </el-tooltip>
            <ColumnSettings
              v-if="columnSettingsKey"
              ref="columnSettingsRef"
              :columns="columns"
              :settings-key="columnSettingsKey"
              @update:columns="handleColumnVisibilityUpdate"
            />
          </div>
        </div>
      </template>

      <!-- Tab 切换 -->
      <div v-if="orderTabs?.length" class="nosel">
        <el-tabs v-model="activeTab" type="card" @tab-change="handleTabChange">
          <el-tab-pane v-for="tab in orderTabs" :key="tab.value" :name="tab.value">
            <template #label>
              <el-badge :value="tab.badge" :hidden="tab.badge === undefined || tab.badge === null || tab.badge === 0">
                {{ tab.label }}
              </el-badge>
            </template>
          </el-tab-pane>
        </el-tabs>
      </div>

      <!-- 表格区域 -->
      <div class="table-wrapper">
        <VirtualTable
          v-if="virtual"
          :columns="virtualColumns"
          :data="data"
          :loading="loading"
          :row-height="virtualRowHeight ?? 50"
          :auto-resize="true"
          :row-key="typeof rowKey === 'string' ? rowKey : 'id'"
          @column-sort="handleVirtualSort"
        />
        <el-table
          v-else
          ref="tableRef"
          v-loading="loading"
          :data="data"
          border
          stripe
          :max-height="tableMaxHeight"
          :row-class-name="getRowClassName"
          :row-key="rowKey"
          :tree-props="treeProps"
          :default-sort="defaultSort"
          @selection-change="handleSelectionChange"
          @sort-change="handleSortChange"
          @row-click="handleRowClick"
          @select="handleSelect"
          @deselect="handleDeselect"
        >
          <!-- 拖拽手柄列 -->
          <el-table-column v-if="rowDrag" width="40" align="center" class-name="drag-handle-column" :resizable="false">
            <template #default>
              <el-icon class="drag-handle">
                <Rank />
              </el-icon>
            </template>
          </el-table-column>

          <!-- 复选框 -->
          <el-table-column v-if="showSelection" type="selection" width="55" align="center" :reserve-selection="reserveSelection" :resizable="false" />

          <!-- 展开 -->
          <el-table-column v-if="expandable" type="expand" :resizable="false">
            <template #default="scope">
              <slot name="expand" :row="scope.row" :index="scope.$index" />
            </template>
          </el-table-column>

          <!-- 动态列渲染 -->
          <template v-for="column in columns" :key="column.prop">
            <!-- 序号 -->
            <el-table-column
              v-if="column.prop === 'index'"
              type="index"
              :label="column.label || '序号'"
              :width="column.width || 60"
              :min-width="column.minWidth"
              :max-width="column.maxWidth"
              :align="column.align || 'center'"
              :index="getIndexNumber"
              :fixed="column.fixed"
              :resizable="column.resizable !== false"
            />

            <!-- 有子列的嵌套 -->
            <template v-else-if="column.children && column.children.length > 0">
              <template v-if="columnVisibility[column.prop] !== false">
                <el-table-column
                  :prop="column.prop"
                  :label="column.label"
                  :width="column.width"
                  :min-width="column.minWidth"
                  :max-width="column.maxWidth"
                  :sortable="column.sortable"
                  :fixed="column.fixed"
                  :resizable="column.resizable !== false"
                >
                  <template v-for="childColumn in column.children" :key="childColumn.prop">
                    <el-table-column
                      v-if="columnVisibility[childColumn.prop] !== false && $slots[`column-${childColumn.prop}`]"
                      :prop="childColumn.prop"
                      :label="childColumn.label"
                      :width="childColumn.width"
                      :min-width="childColumn.minWidth"
                      :max-width="childColumn.maxWidth"
                      :sortable="childColumn.sortable"
                      :fixed="childColumn.fixed"
                      :resizable="childColumn.resizable !== false"
                    >
                      <template #default="scope">
                        <slot :name="`column-${childColumn.prop}`" :row="scope.row" :column="childColumn" />
                      </template>
                    </el-table-column>
                    <el-table-column
                      v-else-if="columnVisibility[childColumn.prop] !== false"
                      :prop="childColumn.prop"
                      :label="childColumn.label"
                      :width="childColumn.width"
                      :min-width="childColumn.minWidth"
                      :max-width="childColumn.maxWidth"
                      :sortable="childColumn.sortable"
                      :fixed="childColumn.fixed"
                      :resizable="childColumn.resizable !== false"
                      :show-overflow-tooltip="childColumn.showOverflowTooltip || false"
                    >
                      <template v-if="childColumn.formatter" #default="scope">
                        {{ childColumn.formatter(scope.row, scope.column) }}
                      </template>
                    </el-table-column>
                  </template>
                </el-table-column>
              </template>
            </template>

            <!-- 普通列 -->
            <template v-else-if="column.prop !== 'index'">
              <el-table-column
                v-if="columnVisibility[column.prop] !== false && $slots[`column-${column.prop}`]"
                :prop="column.prop"
                :label="column.label"
                :width="column.width"
                :min-width="column.minWidth"
                :max-width="column.maxWidth"
                :sortable="column.sortable"
                :fixed="column.fixed"
                :resizable="column.resizable !== false"
                :show-overflow-tooltip="column.showOverflowTooltip || false"
              >
                <template #default="scope">
                  <slot :name="`column-${column.prop}`" :row="scope.row" :column="column" />
                </template>
              </el-table-column>
              <el-table-column
                v-else-if="columnVisibility[column.prop] !== false"
                :prop="column.prop"
                :label="column.label"
                :width="column.width"
                :min-width="column.minWidth"
                :max-width="column.maxWidth"
                :sortable="column.sortable"
                :fixed="column.fixed"
                :resizable="column.resizable !== false"
                :show-overflow-tooltip="column.showOverflowTooltip || false"
              >
                <template v-if="column.formatter" #default="scope">
                  {{ column.formatter(scope.row, scope.column) }}
                </template>
              </el-table-column>
            </template>
          </template>

          <slot name="columns" />
        </el-table>
      </div>

      <!-- 分页 -->
      <TablePagination
        v-if="showPagination"
        :total="localPagination.total"
        :page="localPagination.pageNum"
        :page-size="localPagination.pageSize"
        :page-sizes="[10, 20, 50, 100]"
        @update:page="handlePageChange"
        @update:page-size="handleSizeChange"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { Search, Rank, Loading } from '@element-plus/icons-vue'
import Sortable from 'sortablejs'
import { useI18n } from '@/i18n'
import SearchForm from './SearchForm.vue'
import TablePagination from './TablePagination.vue'
import ColumnSettings from './ColumnSettings.vue'
import VirtualTable from '@/components/VirtualTable.vue'

const { t } = useI18n()

interface SearchField {
  prop: string
  label: string
  /** 搜索字段类型，支持 'select' | 'dateRange' | 'text' | 'input' */
  type: string
  placeholder?: string
  options?: Array<{ label: string; value: string | number }> | (() => Array<{ label: string; value: string | number }>)
  rangeSeparator?: string
  startPlaceholder?: string
  endPlaceholder?: string
  valueFormat?: string
  defaultTime?: [Date, Date]
}

interface TableColumn {
  prop: string
  label: string
  width?: number
  minWidth?: number
  maxWidth?: number
  sortable?: boolean
  /** 固定列位置，支持 boolean | 'left' | 'right' */
  fixed?: boolean | 'left' | 'right' | string
  /** 对齐方式 */
  align?: string
  children?: TableColumn[]
  formatter?: (row: Record<string, unknown>, column: Record<string, unknown>) => string | number
  alwaysShow?: boolean
  defaultShow?: boolean
  resizable?: boolean
  showOverflowTooltip?: boolean
}

interface OrderTab {
  value: string
  label: string
  badge?: number
}

const props = defineProps<{
  columns: TableColumn[]
  searchFields?: SearchField[]
  title?: string
  data: Record<string, unknown>[]
  showPagination?: boolean
  pagination: { pageNum: number; pageSize: number; total: number }
  loading?: boolean
  searchParams?: Record<string, unknown>
  expandable?: boolean
  showHeader?: boolean
  rowClassName?: string | ((row: Record<string, unknown>, index: number) => string)
  showSelection?: boolean
  rowKey?: string | ((row: Record<string, unknown>) => string)
  treeProps?: { children?: string; hasChildren?: string }
  reserveSelection?: boolean
  modelType?: 'page' | 'dialog'
  maxHeight?: string | number
  orderTabs?: OrderTab[]
  activeTab?: string
  columnSettingsKey?: string
  rowDrag?: boolean
  sortSettingsKey?: string
  exporting?: boolean
  exportPercent?: number
  exportStatusText?: string
  virtual?: boolean
  virtualRowHeight?: number
}>()

/** 默认表格最大高度：未指定时设为 600px，避免大数据量时渲染过多 DOM */
const tableMaxHeight = computed(() => {
  return props.maxHeight ?? 600
})

// ==================== 虚拟滚动 ====================

interface VirtualColumnDef {
  prop: string
  label: string
  width?: number
  minWidth?: number
  align?: 'left' | 'center' | 'right'
  fixed?: boolean | 'left' | 'right'
  sortable?: boolean
  formatter?: (row: Record<string, unknown>, column: { prop: string; label: string }) => string
}

const virtualColumns = computed<VirtualColumnDef[]>(() => {
  return props.columns
    .filter((col) => col.prop && col.prop !== 'index')
    .map((col) => ({
      prop: col.prop,
      label: col.label,
      width: col.width,
      minWidth: col.minWidth,
      align: (col.align ?? 'left') as 'left' | 'center' | 'right',
      fixed: col.fixed as boolean | 'left' | 'right' | undefined,
      sortable: col.sortable,
      formatter: col.formatter ? (row: Record<string, unknown>) => String(col.formatter!(row, col as unknown as Record<string, unknown>)) : undefined,
    }))
})

const handleVirtualSort = (params: { column: { prop: string }; key: string; order: string }): void => {
  emit('sort-change', { prop: params.key, order: params.order })
  emit('query', {
    searchParams: { ...localSearchParams },
    pagination: { ...localPagination },
    sort: { prop: params.key, order: params.order },
  })
}

const emit = defineEmits([
  'update:pagination',
  'update:searchParams',
  'query',
  'sort-change',
  'selection-change',
  'select',
  'deselect',
  'tab-change',
  'update:active-tab',
  'row-drop',
])

// 本地副本避免直接修改 props
const localSearchParams = reactive({ ...props.searchParams })
const localPagination = reactive({ ...props.pagination })

// props → 本地（父组件更新时同步）
watch(
  () => props.searchParams,
  (val) => Object.assign(localSearchParams, val),
  { deep: true },
)
watch(
  () => props.pagination,
  (val) => Object.assign(localPagination, val),
  { deep: true },
)

// ==================== 列设置（委托给 ColumnSettings 子组件） ====================
const columnSettingsRef = ref<InstanceType<typeof ColumnSettings> | null>(null)
const columnVisibility = ref<Record<string, boolean>>({})

// 从 ColumnSettings 子组件获取可见性状态
const syncColumnVisibility = () => {
  if (columnSettingsRef.value) {
    columnVisibility.value = columnSettingsRef.value.getColumnVisibility()
  }
}

const handleColumnVisibilityUpdate = (visibility: Record<string, boolean>) => {
  columnVisibility.value = visibility
}

// 监听列变化同步可见性
watch(
  () => props.columns,
  () => {
    nextTick(syncColumnVisibility)
  },
  { immediate: true },
)

// ==================== 排序状态持久化 ====================
const SORT_STORAGE_PREFIX = 'protable_sort_'
const defaultSort = ref<{ prop: string; order: 'ascending' | 'descending' } | undefined>(undefined)

const initSortState = () => {
  if (!props.sortSettingsKey) return
  const saved = localStorage.getItem(SORT_STORAGE_PREFIX + props.sortSettingsKey)
  if (saved) {
    try {
      defaultSort.value = JSON.parse(saved)
    } catch {
      // ignore
    }
  }
}

const saveSortState = (prop: string, order: string) => {
  if (!props.sortSettingsKey) return
  localStorage.setItem(SORT_STORAGE_PREFIX + props.sortSettingsKey, JSON.stringify({ prop, order }))
}

watch(() => props.sortSettingsKey, initSortState, { immediate: true })

// ==================== 行拖拽排序 ====================
let sortableInstance: Sortable | null = null

const initSortable = () => {
  if (!props.rowDrag) return
  nextTick(() => {
    const el = tableRef.value?.$el?.querySelector('.el-table__body-wrapper tbody')
    if (!el) return

    sortableInstance = Sortable.create(el as HTMLElement, {
      handle: '.drag-handle-column',
      animation: 200,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onEnd: (evt) => {
        const { oldIndex, newIndex } = evt
        if (oldIndex !== undefined && newIndex !== undefined && oldIndex !== newIndex) {
          emit('row-drop', { oldIndex, newIndex, data: props.data })
        }
      },
    })
  })
}

const destroySortable = () => {
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }
}

onMounted(() => {
  initSortable()
})

onUnmounted(() => {
  destroySortable()
})

watch(
  () => props.rowDrag,
  (val) => {
    if (val) {
      initSortable()
    } else {
      destroySortable()
    }
  },
)

watch(
  () => props.data,
  () => {
    nextTick(() => {
      if (sortableInstance) {
        sortableInstance.option('disabled', false)
      }
    })
  },
  { deep: true },
)

// ==================== 搜索 ====================
const showSearch = ref(true)
const activeTab = ref<string>(props.activeTab || '')
interface TableInstance {
  $el?: HTMLElement
  toggleRowSelection: (row: Record<string, unknown>, selected?: boolean) => void
  clearSelection: () => void
}

const tableRef = ref<TableInstance | null>(null)

const handleQuery = () => {
  const newPagination = { ...localPagination, pageNum: 1 }
  Object.assign(localPagination, newPagination)
  emit('update:pagination', newPagination)
  emit('query', {
    searchParams: { ...localSearchParams },
    pagination: newPagination,
  })
}

const handleReset = () => {
  handleQuery()
}

const getIndexNumber = (index: number) => {
  const { pageNum, pageSize } = localPagination
  return (pageNum - 1) * pageSize + index + 1
}

const handlePageChange = (pageNum: number) => {
  const newPagination = { ...localPagination, pageNum }
  Object.assign(localPagination, newPagination)
  emit('update:pagination', newPagination)
  emit('query', {
    searchParams: { ...localSearchParams },
    pagination: newPagination,
  })
}

const handleSizeChange = (pageSize: number) => {
  const newPagination = { ...localPagination, pageSize, pageNum: 1 }
  Object.assign(localPagination, newPagination)
  emit('update:pagination', newPagination)
  emit('query', {
    searchParams: { ...localSearchParams },
    pagination: newPagination,
  })
}

const handleSortChange = (sortData: { prop: string | null; order: string | null }) => {
  const prop = sortData.prop || ''
  const order = sortData.order || ''
  if (props.sortSettingsKey) {
    saveSortState(prop, order || '')
  }
  emit('sort-change', { prop, order })
  emit('query', {
    searchParams: { ...localSearchParams },
    pagination: { ...localPagination },
    sort: { prop, order },
  })
}

const handleSelectionChange = (selection: unknown[]) => {
  emit('selection-change', selection)
}

const handleRowClick = (row: unknown) => {
  if (!props.showSelection) return
  tableRef.value?.toggleRowSelection(row as Record<string, unknown>, undefined)
}

const handleSelect = (selection: unknown[], row: unknown) => {
  emit('select', selection, row)
}

const handleDeselect = (selection: unknown[], row: unknown) => {
  emit('deselect', selection, row)
}

const getRowClassName = (rowInfo: { row: Record<string, unknown>; rowIndex: number }): string => {
  if (typeof props.rowClassName === 'function') {
    return props.rowClassName(rowInfo.row, rowInfo.rowIndex) || ''
  }
  return (props.rowClassName as string) || ''
}

const handleTabChange = (tab: string | number): void => {
  emit('tab-change', tab)
  emit('update:active-tab', tab)
}

watch(
  () => props.activeTab,
  (newVal) => {
    if (newVal !== undefined && newVal !== activeTab.value) {
      activeTab.value = newVal
    }
  },
  { immediate: true },
)

defineExpose({
  toggleRowSelection: (row: Record<string, unknown>, selected?: boolean) => {
    tableRef.value?.toggleRowSelection(row, selected)
  },
  clearSelection: () => {
    tableRef.value?.clearSelection()
  },
})
</script>

<style lang="scss" scoped>
/* ================== 搜索切换按钮 ================== */
.search-toggle-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--text-regular);
  font-size: 16px;

  &:hover {
    color: var(--mainColor);
    background-color: var(--mainColor-bg);
  }
}

/* ================== 导出进度条 ================== */
.export-progress {
  margin-bottom: 12px;
  padding: 10px 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: 8px;
}

.export-progress-inner {
  display: flex;
  align-items: center;
  gap: 12px;
}

.export-progress-text {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* ================== 表格卡片 ================== */
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

/* 表格头部行：标题 + 操作按钮 */
.table-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.table-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-shrink: 0;
}

.table-header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.table-wrapper {
  padding: 20px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

/* ========== 移动端适配 ========== */
@media (max-width: 767px) {
  .table-card :deep(.el-card__header) {
    padding: 10px 12px;
  }

  .table-header-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .table-header-left {
    width: 100%;
  }

  .table-header-right {
    width: 100%;
    justify-content: flex-start;
    gap: 6px;
  }

  .table-wrapper {
    padding: 12px;
  }
}

.table-wrapper :deep(.el-table) {
  min-width: 100%;
  width: auto;
}

.table-wrapper :deep(.el-table__body-wrapper) {
  overflow-x: auto;
  overflow-y: auto;
}

.table-wrapper :deep(.el-table__fixed-right) {
  height: 100% !important;
}

/* ================== 拖拽手柄 ================== */
.drag-handle {
  cursor: grab;
  color: var(--text-secondary);
  transition: color 0.2s;
}

.drag-handle:hover {
  color: var(--mainColor);
}

.sortable-ghost {
  opacity: 0.4;
  background: var(--border-light) !important;
}

.sortable-drag {
  opacity: 0.9;
  background: var(--card-bg) !important;
  box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.1);
}

@media (prefers-color-scheme: light) {
  :deep(.el-table__body tr .el-table__cell.el-table__expanded-cell) {
    background-color: #fff !important;
  }
}

/* ================== 列宽拖拽 ================== */
:deep(.el-table__header) {
  .el-table__cell {
    .resize-trigger {
      width: 6px;
    }
  }
}
</style>
