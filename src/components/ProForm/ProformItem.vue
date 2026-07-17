<template>
  <div v-if="isLineType" class="por-form-item__line">
    <el-divider v-bind="mergedComponentProps" content-position="center" border-style="dashed">
      {{ item.label }}
    </el-divider>
  </div>

  <el-form-item v-else v-bind="resolvedFormItemProps" :label="item.label" :prop="item.prop" :rules="resolvedRules" :required="item.required">
    <div class="por-form-item__layout" :class="{ 'por-form-item__layout--with-tip': !!resolvedTip }">
      <div class="por-form-item__main">
        <slot :name="slotName" :item="item" :model-value="modelValue as any" :form-data="formData" :disabled="fieldDisabled" :update-value="updateValue">
          <template v-if="!isUploadType && !isCustomType">
            <component
              :is="customComponent"
              v-if="customComponent"
              v-bind="mergedComponentProps"
              :model-value="modelValue as any"
              :disabled="fieldDisabled"
              :readonly="fieldReadonly"
              @update:model-value="updateValue"
            />

            <el-input
              v-else-if="resolvedType === 'textarea'"
              v-bind="mergedComponentProps"
              :model-value="modelValue as any"
              type="textarea"
              :autosize="mergedComponentProps.autosize ?? { minRows: 3, maxRows: 6 }"
              :disabled="fieldDisabled"
              :readonly="fieldReadonly"
              :placeholder="resolvedPlaceholder"
              :clearable="resolvedClearable"
              resize="none"
              @update:model-value="updateValue"
            />

            <el-input
              v-else-if="resolvedType === 'password'"
              v-bind="mergedComponentProps"
              :model-value="modelValue as any"
              show-password
              :disabled="fieldDisabled"
              :readonly="fieldReadonly"
              :placeholder="resolvedPlaceholder"
              :clearable="resolvedClearable"
              @update:model-value="updateValue"
            />

            <ProFormMoney
              v-else-if="resolvedType === 'money'"
              v-bind="mergedComponentProps"
              :model-value="modelValue as any"
              :disabled="fieldDisabled"
              :readonly="fieldReadonly"
              :placeholder="resolvedPlaceholder"
              :clearable="resolvedClearable"
              @update:model-value="updateValue"
            />

            <el-input
              v-else-if="resolvedType === 'number'"
              type="number"
              v-bind="mergedComponentProps"
              class="por-form-item__number"
              :model-value="modelValue as any"
              :disabled="fieldDisabled"
              :readonly="fieldReadonly"
              @update:model-value="updateValue"
            />

            <el-select
              v-else-if="resolvedType === 'select'"
              v-bind="mergedComponentProps"
              :model-value="modelValue as any"
              :disabled="fieldInteractiveDisabled"
              :readonly="fieldReadonly"
              :placeholder="resolvedPlaceholder"
              :clearable="resolvedClearable"
              @update:model-value="updateValue"
            >
              <el-option
                v-for="option in resolvedOptions"
                :key="getOptionBindKey(option)"
                :label="getOptionLabel(option)"
                :value="getOptionBindValue(option)"
                :disabled="getOptionDisabled(option)"
              />
            </el-select>

            <el-tree-select
              v-else-if="resolvedType === 'tree-select'"
              v-bind="mergedComponentProps"
              :data="resolvedOptions as any"
              :model-value="modelValue as any"
              :disabled="fieldInteractiveDisabled"
              :placeholder="resolvedPlaceholder"
              :clearable="resolvedClearable"
              :node-key="String(resolvedOptionValue)"
              :props="resolvedTreeSelectProps"
              @update:model-value="updateValue"
            />

            <el-date-picker
              v-else-if="isDateType"
              v-bind="mergedComponentProps"
              class="por-form-item__date"
              :model-value="modelValue as any"
              :type="resolvedDateType as any"
              :disabled="fieldDisabled"
              :readonly="fieldReadonly"
              :placeholder="resolvedPlaceholder"
              :start-placeholder="resolvedStartPlaceholder ?? '开始' + (item.label || '')"
              :end-placeholder="resolvedEndPlaceholder ?? '结束' + (item.label || '')"
              :clearable="resolvedClearable"
              @update:model-value="updateValue"
            />

            <el-time-picker
              v-else-if="resolvedType === 'time' || resolvedType === 'timerange'"
              v-bind="mergedComponentProps"
              class="por-form-item__date"
              :model-value="modelValue as any"
              :is-range="resolvedType === 'timerange'"
              :disabled="fieldDisabled"
              :readonly="fieldReadonly"
              :placeholder="resolvedPlaceholder"
              :start-placeholder="resolvedStartPlaceholder ?? '开始' + (item.label || '')"
              :end-placeholder="resolvedEndPlaceholder ?? '结束' + (item.label || '')"
              :clearable="resolvedClearable"
              @update:model-value="updateValue"
            />

            <el-switch
              v-else-if="resolvedType === 'switch'"
              v-bind="mergedComponentProps"
              :model-value="modelValue as any"
              :disabled="fieldInteractiveDisabled"
              @update:model-value="updateValue"
            />

            <el-radio-group
              v-else-if="resolvedType === 'radio'"
              v-bind="mergedComponentProps"
              :model-value="modelValue as any"
              :disabled="fieldInteractiveDisabled"
              @update:model-value="updateValue"
            >
              <el-radio
                v-for="option in resolvedOptions"
                :key="getOptionBindKey(option)"
                border
                style="margin-right: 10px; margin-top: 5px"
                :value="getRadioBindValue(option)"
                :disabled="fieldInteractiveDisabled || getOptionDisabled(option)"
              >
                {{ getOptionLabel(option) }}
              </el-radio>
            </el-radio-group>

            <el-radio-group
              v-else-if="resolvedType === 'radio-button'"
              v-bind="mergedComponentProps"
              :model-value="modelValue as any"
              :disabled="fieldInteractiveDisabled"
              @update:model-value="updateValue"
            >
              <el-radio-button
                v-for="option in resolvedOptions"
                :key="getOptionBindKey(option)"
                :value="getRadioBindValue(option)"
                :disabled="fieldInteractiveDisabled || getOptionDisabled(option)"
              >
                {{ getOptionLabel(option) }}
              </el-radio-button>
            </el-radio-group>

            <el-checkbox-group
              v-else-if="resolvedType === 'checkbox'"
              v-bind="mergedComponentProps"
              :model-value="modelValue as any"
              :disabled="fieldInteractiveDisabled"
              @update:model-value="updateValue"
            >
              <el-checkbox
                v-for="option in resolvedOptions"
                :key="getOptionBindKey(option)"
                :value="getCheckboxBindValue(option)"
                :disabled="fieldInteractiveDisabled || getOptionDisabled(option)"
              >
                {{ getOptionLabel(option) }}
              </el-checkbox>
            </el-checkbox-group>

            <el-input
              v-else
              v-bind="mergedComponentProps"
              :model-value="modelValue as any"
              :disabled="fieldDisabled"
              :readonly="fieldReadonly"
              :placeholder="resolvedPlaceholder"
              :clearable="resolvedClearable"
              @update:model-value="updateValue"
            />
          </template>
        </slot>
      </div>

      <span v-if="resolvedTip" class="tip">{{ resolvedTip }}</span>
    </div>
  </el-form-item>
</template>

<script setup lang="ts">
import ProFormMoney from './ProFormMoney.vue'

interface FormItemSchema {
  prop: string
  label?: string
  type?: string
  slot?: string
  component?: string
  placeholder?: string | ((formData: Record<string, unknown>, item: FormItemSchema) => string)
  required?: boolean
  disabled?: boolean | ((formData: Record<string, unknown>, item: FormItemSchema) => boolean)
  readonly?: boolean | ((formData: Record<string, unknown>, item: FormItemSchema) => boolean)
  clearable?: boolean
  filterable?: boolean | ((formData: Record<string, unknown>, item: FormItemSchema) => boolean)
  multiple?: boolean | ((formData: Record<string, unknown>, item: FormItemSchema) => boolean)
  hidden?: boolean | ((formData: Record<string, unknown>, item: FormItemSchema) => boolean)
  activeValue?: unknown
  inactiveValue?: unknown
  options?: unknown[] | (() => unknown[])
  optionLabel?: string
  optionValue?: string
  optionDisabled?: string
  rules?: Record<string, unknown>[]
  tip?: string | ((formData: Record<string, unknown>, item: FormItemSchema) => string)
  props?: Record<string, unknown> | ((formData: Record<string, unknown>, item: FormItemSchema) => Record<string, unknown>)
  componentProps?: Record<string, unknown> | ((formData: Record<string, unknown>, item: FormItemSchema) => Record<string, unknown>)
  formItemProps?: Record<string, unknown> | ((formData: Record<string, unknown>, item: FormItemSchema) => Record<string, unknown>)
  defaultValue?: unknown
  colProps?: Record<string, unknown>
  [key: string]: unknown
}

const props = defineProps<{
  item: FormItemSchema
  modelValue?: unknown
  formData?: Record<string, unknown>
  disabled?: boolean
  readonly?: boolean
}>()

const emit = defineEmits(['update:modelValue'])

const dateTypes = ['date', 'dates', 'datetime', 'week', 'month', 'year', 'daterange', 'datetimerange', 'monthrange']
const clearableTypes = [
  'input',
  'money',
  'textarea',
  'password',
  'select',
  'date',
  'dates',
  'datetime',
  'week',
  'month',
  'year',
  'number',
  'daterange',
  'datetimerange',
  'monthrange',
  'time',
  'timerange',
]
const changeTriggerTypes = [
  'select',
  'date',
  'dates',
  'datetime',
  'week',
  'month',
  'year',
  'number',
  'daterange',
  'datetimerange',
  'monthrange',
  'time',
  'timerange',
  'switch',
  'radio',
  'radio-button',
  'checkbox',
]
const readonlyAsDisabledTypes = ['select', 'tree-select', 'switch', 'radio', 'radio-button', 'checkbox']

const resolveMaybeGetter = (value: unknown): unknown => {
  if (typeof value === 'function') {
    return (value as (formData: Record<string, unknown> | undefined, item: FormItemSchema) => unknown)(props.formData, props.item)
  }
  return value
}

const normalizedTypeMap: Record<string, string> = {
  input: 'input',
  money: 'money',
  textarea: 'textarea',
  password: 'password',
  number: 'number',
  'input-number': 'number',
  select: 'select',
  'tree-select': 'tree-select',
  date: 'date',
  datetime: 'datetime',
  daterange: 'daterange',
  'date-range': 'daterange',
  datetimerange: 'datetimerange',
  'datetime-range': 'datetimerange',
  time: 'time',
  timerange: 'timerange',
  switch: 'switch',
  radio: 'radio',
  'radio-button': 'radio-button',
  checkbox: 'checkbox',
  upload: 'upload',
  custom: 'custom',
  line: 'line',
}

const mergedComponentProps = computed(() => {
  const builtInProps: Record<string, unknown> = {}
  if (resolvedType.value === 'select') {
    if (props.item.filterable !== undefined) {
      builtInProps.filterable = resolveMaybeGetter(props.item.filterable)
    }
    if (props.item.multiple !== undefined) {
      builtInProps.multiple = resolveMaybeGetter(props.item.multiple)
    }
  }
  if (resolvedType.value === 'switch') {
    if (props.item.activeValue !== undefined) {
      builtInProps.activeValue = resolveMaybeGetter(props.item.activeValue)
    }
    if (props.item.inactiveValue !== undefined) {
      builtInProps.inactiveValue = resolveMaybeGetter(props.item.inactiveValue)
    }
  }
  return {
    ...builtInProps,
    ...((resolveMaybeGetter(props.item.props) as Record<string, unknown>) || {}),
    ...((resolveMaybeGetter(props.item.componentProps) as Record<string, unknown>) || {}),
  }
})

const resolvedFormItemProps = computed(() => (resolveMaybeGetter(props.item.formItemProps) || {}) as Record<string, unknown>)
const resolvedOptions = computed(() => (resolveMaybeGetter(props.item.options) || []) as unknown[])
const resolvedOptionValue = computed(() => (props.item.optionValue as string) || 'value')
const resolvedTreeSelectProps = computed(() => ({
  label: (props.item.optionLabel as string) || 'label',
  children: 'children',
  disabled: (props.item.optionDisabled as string) || 'disabled',
  ...((resolveMaybeGetter(props.item.treeProps) as Record<string, unknown>) || {}),
}))
const resolvedTip = computed(() => resolveMaybeGetter(props.item.tip) as string | undefined)

const resolvedType = computed(() => {
  const type = (props.item.type as string | undefined) || 'input'
  return normalizedTypeMap[type] || type
})

const resolvedDateType = computed(() => {
  return (mergedComponentProps.value.type as string) || resolvedType.value
})

const isUploadType = computed(() => resolvedType.value === 'upload')
const isCustomType = computed(() => resolvedType.value === 'custom')
const isLineType = computed(() => resolvedType.value === 'line')
const isDateType = computed(() => dateTypes.includes(resolvedDateType.value))

const slotName = computed(() => (props.item.slot as string | undefined) || (props.item.prop as string))
const customComponent = computed(() => props.item.component as string | undefined)
const fieldDisabled = computed(() => props.disabled || resolveMaybeGetter(props.item.disabled) === true)
const fieldReadonly = computed(() => props.readonly || resolveMaybeGetter(props.item.readonly) === true)
const fieldInteractiveDisabled = computed(() => fieldDisabled.value || (fieldReadonly.value && readonlyAsDisabledTypes.includes(resolvedType.value)))

const resolvedClearable = computed(() => {
  if (fieldDisabled.value || fieldReadonly.value) return false
  return (mergedComponentProps.value.clearable as boolean | undefined) ?? clearableTypes.includes(resolvedType.value)
})

const hasRequiredRule = computed(() => ((props.item.rules as { required?: boolean }[]) || []).some((rule: { required?: boolean }) => rule?.required))

const getRequiredRule = (): { required: boolean; message: string; trigger: string } => {
  const label = props.item.label || '该项'
  const isSelectLike = changeTriggerTypes.includes(resolvedType.value)
  return {
    required: true,
    message: (isSelectLike ? '请选择' : '请输入') + label,
    trigger: isSelectLike ? 'change' : 'blur',
  }
}

const resolvedRules = computed(() => {
  const rules = [...((props.item.rules as { required?: boolean; message?: string; trigger?: string }[]) || [])]
  if (props.item.required && !hasRequiredRule.value) {
    rules.unshift(getRequiredRule())
  }
  return rules
})

const resolvedPlaceholder = computed(() => {
  const schemaPlaceholder = resolveMaybeGetter(props.item.placeholder) as string | undefined
  if (schemaPlaceholder) return schemaPlaceholder
  if (mergedComponentProps.value.placeholder) return mergedComponentProps.value.placeholder as string
  if (['select', 'date', 'datetime', 'daterange', 'datetimerange', 'monthrange', 'time', 'timerange'].includes(resolvedType.value)) {
    return '请选择' + (props.item.label || '')
  }
  return '请输入' + (props.item.label || '')
})

/** date-picker/time-picker 占位符（避免合并 props 的 unknown 类型问题） */
const resolvedStartPlaceholder = computed(() => mergedComponentProps.value.startPlaceholder as string | undefined)
const resolvedEndPlaceholder = computed(() => mergedComponentProps.value.endPlaceholder as string | undefined)

const getOptionLabel = (option: unknown): string => String((option as Record<string, unknown>)?.[(props.item.optionLabel as string) || 'label'] ?? '')
const getOptionValue = (option: unknown): unknown => (option as Record<string, unknown>)?.[(props.item.optionValue as string) || 'value']
/** 模板中用于 v-for :key 绑定 */
const getOptionBindKey = (option: unknown): string | number => {
  const val = getOptionValue(option)
  return typeof val === 'string' || typeof val === 'number' ? val : String(val ?? '')
}
/** 模板中用于 el-option/value 绑定 */
const getOptionBindValue = (option: unknown): string | number | boolean => getOptionValue(option) as string | number | boolean
/** 模板中用于 el-radio/value 绑定 */
const getRadioBindValue = (option: unknown): string | number | boolean => getOptionValue(option) as string | number | boolean
/** 模板中用于 el-checkbox/value 绑定 */
const getCheckboxBindValue = (option: unknown): string | number | boolean | object => getOptionValue(option) as string | number | boolean | object
const getOptionDisabled = (option: unknown): boolean => !!(option as Record<string, unknown>)?.[(props.item.optionDisabled as string) || 'disabled']

const updateValue = (value: unknown): void => {
  if (fieldDisabled.value || fieldReadonly.value) return
  emit('update:modelValue', value)
}
</script>

<style lang="scss" scoped>
.por-form-item__line {
  width: 100%;
}

.por-form-item__line :deep(.el-divider) {
  margin: 8px 0 20px;
}

.por-form-item__line :deep(.el-divider .el-divider__text) {
  font-size: 11px;
  letter-spacing: 2px;
  color: #909399;
}

.por-form-item__upload-placeholder {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
  line-height: 32px;
}

.por-form-item__layout {
  display: flex;
  width: 100%;
}

.por-form-item__layout--with-tip {
  align-items: center;
  gap: 8px;
}

.por-form-item__main {
  flex: 1;
  min-width: 0;
}

.por-form-item__main :deep(.el-date-editor.el-input),
.por-form-item__main :deep(.el-date-editor.el-input__wrapper) {
  width: 100% !important;
}

.por-form-item__main :deep(.el-date-editor--datetime.por-form-item__date .el-input__wrapper) {
  margin-top: -6px !important;
}

.por-form-item__tip {
  flex-shrink: 0;
  color: var(--el-text-color-regular);
  white-space: nowrap;
}

.por-form-item__number,
.por-form-item__date {
  width: 100%;
}
</style>
