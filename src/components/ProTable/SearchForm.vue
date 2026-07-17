<template>
  <el-collapse-transition>
    <div v-if="searchFields?.length && showSearch" class="search-form">
      <el-card shadow="never" class="search-form__card">
        <el-form ref="queryFormRef" :model="searchModel" :inline="true" @keyup.enter="handleSearch">
          <el-form-item v-for="field in searchFields" :key="field.prop" :label="field.label" :prop="field.prop">
            <template v-if="field.type === 'select'">
              <el-select
                v-model="(searchModel as any)[field.prop]"
                :placeholder="field.placeholder"
                :clearable="true"
                style="width: 240px"
                @change="handleSearch"
              >
                <el-option v-for="option in getOptions(field.options)" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </template>
            <template v-else-if="field.type === 'dateRange'">
              <el-date-picker
                v-model="(searchModel as any)[field.prop]"
                type="daterange"
                :range-separator="field.rangeSeparator || '-'"
                :start-placeholder="field.startPlaceholder || '开始日期'"
                :end-placeholder="field.endPlaceholder || '结束日期'"
                :value-format="field.valueFormat || 'YYYY-MM-DD HH:mm:ss'"
                :default-time="field.defaultTime || [new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 1, 1, 23, 59, 59)]"
                :clearable="true"
                style="width: 360px"
                @change="handleSearch"
              />
            </template>
            <template v-else>
              <el-input
                v-model="(searchModel as any)[field.prop]"
                :placeholder="field.placeholder"
                :clearable="true"
                style="width: 240px"
                @input="handleInputChange"
                @clear="handleSearch"
              />
            </template>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :icon="Search" :loading="loading" @click="handleSearch">
              {{ t('common.search') }}
            </el-button>
            <el-button :icon="Refresh" @click="handleReset">
              {{ t('common.reset') }}
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
  </el-collapse-transition>
</template>

<script setup lang="ts">
import { Search, Refresh } from '@element-plus/icons-vue'
import { useI18n } from '@/i18n'
import { debounce } from '@/utils/debounce'

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

defineProps<{
  searchFields: SearchField[]
  showSearch: boolean
  loading?: boolean
}>()

const searchModel = defineModel<Record<string, unknown>>('searchModel', { required: true })

const emit = defineEmits<{
  search: []
  reset: []
}>()

const queryFormRef = ref<InstanceType<typeof import('element-plus').ElForm> | null>(null)

const getOptions = (options: SearchField['options']) => {
  if (typeof options === 'function') return options()
  return options || []
}

const handleSearch = () => {
  emit('search')
}

const handleReset = () => {
  queryFormRef.value?.resetFields()
  emit('reset')
}

/** 输入防抖：文本输入框在停止输入 300ms 后自动触发搜索 */
const handleInputChange = debounce(() => {
  emit('search')
}, 300)
</script>

<style lang="scss" scoped>
.search-form {
  margin-bottom: 20px;
}

.search-form__card {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: var(--card-bg);
}

.search-form__card :deep(.el-card__body) {
  padding: 20px 20px 4px !important;
}
</style>
