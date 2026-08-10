<template>
  <div class="page-container">
    <ProTable
      ref="proTableRef"
      :title="title"
      :columns="columns"
      :search-fields="searchFields"
      :data="crud.list.value"
      :loading="crud.loading.value"
      :show-pagination="true"
      :pagination="crud.pagination"
      :search-params="crud.searchParams"
      :column-settings-key="columnSettingsKey"
      :show-selection="showSelection"
      @query="crud.onQuery"
      @selection-change="crud.handleSelectionChange"
    >
      <template #header-buttons>
        <el-button v-if="showBatchDelete" type="danger" :icon="Delete" :disabled="!crud.hasSelection.value" @click="crud.handleBatchDelete">
          批量删除
          <template v-if="crud.hasSelection.value">
            {{ ` (${crud.selectedIds.value.length})` }}
          </template>
        </el-button>
        <el-button type="primary" :icon="Plus" @click="crud.openCreate">
          {{ createLabel }}
        </el-button>
        <slot name="header-buttons" />
        <el-button v-if="showExport" :icon="Download" @click="handleExport">导出</el-button>
      </template>

      <template v-for="col in columns" :key="col.prop" #[`column-${col.prop}`]="{ row }">
        <slot :name="`column-${col.prop}`" :row="row" />
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="primary" link size="small" :icon="Edit" @click="crud.openEdit(row)">编辑</el-button>
          <slot name="actions" :row="row" />
          <el-button type="danger" link size="small" :icon="Delete" @click="crud.handleDelete(row)">删除</el-button>
        </div>
      </template>
    </ProTable>

    <FormDialog
      ref="formDialogRef"
      v-model="crud.dialogVisible.value"
      v-model:form="crud.form as any"
      :title="crud.isEdit.value ? '编辑' : '新增'"
      :loading="crud.submitLoading.value"
      :schema="props.formSchema"
      @confirm="crud.handleSubmit"
    >
      <template v-for="item in props.formSchema" :key="item.prop" #[`content-${item.prop}`]="slotProps">
        <slot :name="`form-${item.prop}`" v-bind="slotProps" />
      </template>
    </FormDialog>
  </div>
</template>

<script setup lang="ts" generic="T extends { id: number }">
import { onMounted } from 'vue'
import { Plus, Edit, Delete, Download } from '@element-plus/icons-vue'
import ProTable from '@/components/ProTable/index.vue'
import type { TableColumn } from '@/types/table'
import { downloadBlob } from '@/utils/download'
import FormDialog from '@/components/FormDialog.vue'
import { useCrud } from '@/composables/useCrud'
import type { CrudApi, UseCrudOptions } from '@/composables/useCrud'

const props = defineProps<{
  title: string
  api: CrudApi<T>
  columns: Array<TableColumn & { [key: string]: unknown }>
  searchFields: Array<{
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
    [key: string]: unknown
  }>
  formSchema: Array<{
    prop: string
    label: string
    [key: string]: unknown
  }>
  defaultForm: Partial<T>
  defaultSearchParams?: Record<string, unknown>
  columnSettingsKey?: string
  createLabel?: string
  showSelection?: boolean
  showBatchDelete?: boolean
  showExport?: boolean
  transform?: (data: Partial<T>) => Partial<T>
  onExport?: () => Promise<void>
}>()

const crudOptions: UseCrudOptions<T> = {
  api: props.api,
  defaultForm: props.defaultForm,
  defaultSearchParams: props.defaultSearchParams,
  transform: props.transform,
}

const crud = useCrud<T>(crudOptions)

async function handleExport(): Promise<void> {
  if (props.onExport) {
    await props.onExport()
  } else if (props.api.export) {
    const blob = await props.api.export({ ...crud.searchParams })
    downloadBlob(new Blob([blob]), `${props.title}.xlsx`)
  }
}

onMounted(() => {
  crud.fetchData()
})
</script>

<style lang="scss" scoped>
.table-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
