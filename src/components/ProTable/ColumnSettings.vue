<template>
  <el-dropdown trigger="click" @command="handleCommand">
    <el-button text :icon="Setting" size="small" class="column-settings__btn">
      {{ t('common.columnSettings') }}
    </el-button>
    <template #dropdown>
      <el-dropdown-menu class="column-settings__menu">
        <el-dropdown-item v-for="col in settableColumns" :key="col.prop" :command="col.prop" :divided="col.divided">
          <el-checkbox :model-value="columnVisibility[col.prop] !== false" @click.stop @change="toggleColumn(col.prop)">
            {{ col.label }}
          </el-checkbox>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { Setting } from '@element-plus/icons-vue'
import { useI18n } from '@/i18n'

const { t } = useI18n()

interface TableColumn {
  prop: string
  label: string
  alwaysShow?: boolean
  defaultShow?: boolean
  divided?: boolean
}

const STORAGE_PREFIX = 'protable_columns_'

const props = defineProps<{
  columns: TableColumn[]
  settingsKey: string
}>()

const emit = defineEmits<{
  'update:columns': [visibility: Record<string, boolean>]
}>()

const columnVisibility = ref<Record<string, boolean>>({})

const settableColumns = computed(() => {
  return props.columns.filter((c) => c.prop !== 'index' && c.prop !== 'actions' && !c.alwaysShow)
})

const initColumnVisibility = () => {
  const saved = localStorage.getItem(STORAGE_PREFIX + props.settingsKey)
  if (saved) {
    try {
      columnVisibility.value = JSON.parse(saved)
    } catch {
      // ignore
    }
  }
  for (const col of props.columns) {
    const prop = col.prop
    if (prop && prop !== 'index') {
      if (columnVisibility.value[prop] === undefined) {
        columnVisibility.value[prop] = col.defaultShow !== false
      }
    }
  }
}

const saveColumnVisibility = () => {
  localStorage.setItem(STORAGE_PREFIX + props.settingsKey, JSON.stringify(columnVisibility.value))
}

const toggleColumn = (prop: string) => {
  columnVisibility.value[prop] = columnVisibility.value[prop] === false
  saveColumnVisibility()
  emit('update:columns', { ...columnVisibility.value })
}

const handleCommand = (prop: string) => {
  toggleColumn(prop)
}

watch(() => props.columns, initColumnVisibility, { immediate: true })
watch(() => props.settingsKey, initColumnVisibility)

defineExpose({
  getColumnVisibility: () => columnVisibility.value,
})
</script>

<style lang="scss" scoped>
.column-settings__btn {
  color: var(--text-secondary);
  font-size: 13px;
}

.column-settings__btn:hover {
  color: var(--mainColor);
}

.column-settings__menu {
  max-height: 300px;
  overflow-y: auto;
}

.column-settings__menu .el-dropdown-menu__item {
  padding: 4px 16px;
}

.column-settings__menu .el-checkbox {
  margin-right: 0;
  height: 28px;
  line-height: 28px;
}
</style>
