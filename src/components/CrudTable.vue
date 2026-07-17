<template>
  <div class="crud-table">
    <ProTable
      ref="proTableRef"
      :columns="columns"
      :search-fields="searchFields"
      :data="list"
      :loading="loading"
      :show-pagination="showPagination"
      :pagination="pagination"
      :search-params="searchParams"
      :expandable="expandable"
      :show-header="showHeader"
      :row-class-name="rowClassComputed as any"
      :show-selection="showSelection"
      :row-key="rowKey"
      :reserve-selection="reserveSelection"
      :model-type="modelType"
      :max-height="maxHeight"
      :column-settings-key="columnSettingsKey"
      @query="handleQuery"
      @sort-change="onSortChange"
      @selection-change="handleSelectionChange"
      @select="onSelect"
      @deselect="onDeselect"
    >
      <template #header>
        <el-row :gutter="10">
          <el-col :span="4">
            <div class="q-title">
              {{ title }}
            </div>
          </el-col>
          <el-col :span="16" style="margin-left: auto; display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: nowrap">
            <slot name="header-left" />
            <slot name="header-buttons" />
            <slot name="header-right" />
          </el-col>
        </el-row>
      </template>

      <template v-for="(column, _index) in columns" :key="column.prop || _index" #[`column-${column.prop}`]="{ row }">
        <slot :name="`column-${column.prop}`" :row="row" :column="column">
          <slot v-if="!$slots[`column-${column.prop}`]" :name="column.prop" :row="row" />
        </slot>
      </template>

      <template #actions="{ row }">
        <div v-if="$slots['actions']" class="table-actions">
          <slot name="actions" :row="row" />
          <slot name="delete-action" :row="row">
            <el-button v-if="enableDelete" type="danger" link size="small" :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </slot>
        </div>
        <div v-else-if="enableDelete" class="table-actions">
          <slot name="edit-action" :row="row">
            <el-button type="primary" link size="small" :icon="Edit" @click="handleEdit(row)">编辑</el-button>
          </slot>
          <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row)">删除</el-button>
        </div>
      </template>
    </ProTable>

    <FormDialog
      ref="formDialogRef"
      v-model="dialogVisible"
      v-model:form="form as any"
      :title="dialogTitle"
      :loading="submitLoading"
      :schema="formSchema"
      :width="dialogWidth"
      @confirm="handleConfirm"
      @closed="handleDialogClosed"
    >
      <slot name="form" />
      <template v-for="item in formSchema" :key="item.prop">
        <slot
          :name="`form-${item.prop}`"
          v-bind="{
            modelValue: (form as any)[item.prop],
            'update:modelValue': (v: unknown) => ((form as any)[item.prop] = v),
          }"
        />
      </template>
    </FormDialog>
  </div>
</template>

<script setup lang="ts" generic="T extends { id: number }">
import { Delete, Edit } from '@element-plus/icons-vue'
import ProTable from './ProTable/index.vue'
import FormDialog from './FormDialog.vue'
import type { CrudApi } from '@/composables/useCrud'

import { useCrud } from '@/composables/useCrud'
import { useDialog } from '@/composables/useDialog'

interface CrudTableColumn {
  prop: string
  label: string
  width?: number
  minWidth?: number
  maxWidth?: number
  sortable?: boolean
  fixed?: string | boolean
  align?: string
  children?: CrudTableColumn[]
  formatter?: (row: Record<string, unknown>, column: Record<string, unknown>) => string | number
  alwaysShow?: boolean
  defaultShow?: boolean
  resizable?: boolean
  showOverflowTooltip?: boolean
}

interface CrudSearchField {
  prop: string
  label: string
  type: string
  placeholder?: string
  options?: Array<{ label: string; value: string | number }> | (() => Array<{ label: string; value: string | number }>)
  rangeSeparator?: string
  startPlaceholder?: string
  endPlaceholder?: string
  valueFormat?: string
  defaultTime?: [Date, Date]
}

interface CrudFormField {
  prop: string
  label: string
  type?: string
  placeholder?: string
  rules?: Record<string, unknown>[]
  [key: string]: unknown
}

const props = defineProps<{
  title: string
  api: CrudApi<T>
  columns: CrudTableColumn[]
  searchFields: CrudSearchField[]
  formSchema: CrudFormField[]
  defaultForm: Partial<T>
  defaultSearchParams?: Record<string, unknown>
  columnSettingsKey?: string
  showPagination?: boolean
  expandable?: boolean
  showHeader?: boolean
  rowClassName?: string | ((row: T, index: number) => string)
  showSelection?: boolean
  enableBatchDelete?: boolean
  enableEdit?: boolean
  enableDelete?: boolean
  enableAdd?: boolean
  rowKey?: string
  reserveSelection?: boolean
  modelType?: 'page' | 'dialog'
  maxHeight?: number | string
  dialogWidth?: string
  createTitle?: string
  editTitle?: string
  transform?: (data: Partial<T>) => Partial<T>
  beforeDelete?: (row: T) => Promise<boolean>
  afterDelete?: () => void
  afterSubmit?: () => void
}>()

const {
  title,
  api,
  columns,
  searchFields,
  formSchema,
  defaultForm,
  defaultSearchParams = {},
  columnSettingsKey = '',
  showPagination = true,
  expandable = false,
  showHeader = true,
  rowClassName = '',
  showSelection = props.enableBatchDelete ?? false,
  enableDelete = true,
  rowKey = 'id',
  reserveSelection = false,
  modelType = 'page',
  maxHeight,
  dialogWidth = '520px',
  transform,
  beforeDelete,
  afterDelete,
  afterSubmit,
} = props

const crud = useCrud<T>({
  api,
  defaultForm,
  defaultSearchParams,
  transform,
  afterSubmit,
  onDeleteSuccess: () => {
    afterDelete?.()
  },
})

// 解构crud供模板使用
const { list, loading, pagination, searchParams, dialogVisible, submitLoading, form } = crud

const dialog = useDialog({
  defaultForm,
  onConfirm: async () => {
    const result = await crud.handleSubmit()
    return result
  },
})

const rowClassComputed = computed(() => {
  return rowClassName as string | ((row: T, index: number) => string) | undefined
})

const dialogTitle = computed(() => {
  return dialog.isEdit.value ? `${props.editTitle}${props.title}` : `${props.createTitle}${props.title}`
})

function handleQuery(params: { pagination?: { pageNum: number; pageSize: number }; searchParams?: Record<string, unknown> }): void {
  crud.onQuery(params)
}

function handleSelectionChange(selection: T[]): void {
  crud.handleSelectionChange(selection)
  emit('selection-change', selection)
}

function handleEdit(row: T): void {
  dialog.openEdit(row)
  crud.openEdit(row)
  emit('edit', row)
}

async function handleDelete(row: T): Promise<void> {
  if (beforeDelete) {
    const allow = await beforeDelete(row)
    if (!allow) return
  }
  await crud.handleDelete(row)
  emit('delete', row)
}

async function handleConfirm(): Promise<void> {
  const ok = await dialog.confirm()
  if (ok) {
    emit('submit', {
      isEdit: dialog.isEdit.value,
      data: dialog.form,
    })
  }
}

function handleDialogClosed(): void {
  dialog.handleClosed()
}

function onSortChange(params: { prop: string; order: string }): void {
  emit('sort-change', params)
}

function onSelect(selection: T[], row: T): void {
  emit('select', selection, row)
}

function onDeselect(selection: T[], row: T): void {
  emit('deselect', selection, row)
}

const emit = defineEmits<{
  'selection-change': [selection: T[]]
  edit: [row: T]
  delete: [row: T]
  submit: [data: { isEdit: boolean; data: Partial<T> }]
  'sort-change': [params: { prop: string; order: string }]
  select: [selection: T[], row: T]
  deselect: [selection: T[], row: T]
}>()

defineExpose({
  crud,
  dialog,
  refresh: () => crud.refresh(),
})
</script>

<style lang="scss" scoped>
.crud-table {
  .table-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
}
</style>
