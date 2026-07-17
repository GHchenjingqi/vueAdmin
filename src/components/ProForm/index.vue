<template>
  <el-form
    ref="formRef"
    class="pro-form custom"
    :model="formData"
    :rules="rules as any"
    v-bind="$attrs as Record<string, any>"
    :label-width="labelWidth"
    @submit.prevent
  >
    <el-row :gutter="gutter">
      <el-col v-for="item in visibleSchema" :key="item.prop" v-bind="getColProps(item)">
        <ProFormItem
          :item="item"
          :model-value="getFieldValue(item.prop)"
          :form-data="formData"
          :disabled="disabled"
          :readonly="readonly"
          @update:model-value="setFieldValue(item.prop, $event, item)"
        >
          <template v-for="slotName in forwardedSlotNames" :key="slotName" #[slotName]="slotProps">
            <slot :name="slotName" v-bind="slotProps as Record<string, unknown>" />
          </template>
          <template #content="slotProps">
            <slot name="content" v-bind="slotProps as Record<string, unknown>" />
          </template>
        </ProFormItem>
      </el-col>

      <el-col v-if="showActions" :span="24">
        <div class="pro-form__actions" style="text-align: center">
          <slot name="action" :model="formData" :submit="handleSubmit" :reset="handleReset" :loading="submitLoading">
            <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
              {{ submitText }}
            </el-button>
            <el-button v-if="showReset" @click="handleReset">
              {{ resetText }}
            </el-button>
          </slot>
        </div>
      </el-col>
    </el-row>
  </el-form>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, useSlots } from 'vue'
import ProFormItem from './ProformItem.vue'

interface FormSchemaItem {
  prop: string
  defaultValue?: unknown
  hidden?: boolean | ((model: Record<string, unknown>) => boolean)
  colProps?: Record<string, unknown>
  [key: string]: unknown
}

const props = defineProps<{
  modelValue?: Record<string, unknown>
  schema: FormSchemaItem[]
  rules?: Record<string, unknown>
  columns?: number
  gutter?: number
  showActions?: boolean
  showReset?: boolean
  submitText?: string
  resetText?: string
  submitLoading?: boolean
  disabled?: boolean
  readonly?: boolean
  labelWidth?: string | number
}>()

const emit = defineEmits(['update:modelValue', 'submit', 'reset', 'change'])

const slots = useSlots()
const formRef = ref<Record<string, unknown> | null>(null)
const formData = reactive<Record<string, unknown>>({})
const initialModel = ref<Record<string, unknown>>({})
const syncingFromProps = ref(false)
const lastEmittedModel = ref('')

const normalizePath = (path: string): string[] => {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
}

const cloneValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return new Date(value.getTime())
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => cloneValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).reduce((result: Record<string, unknown>, key) => {
      result[key] = cloneValue((value as Record<string, unknown>)[key])
      return result
    }, {})
  }
  return value
}

const serializeModel = (value: unknown): string => {
  try {
    return JSON.stringify(value)
  } catch {
    return `${Date.now()}`
  }
}

const getValueByPath = (source: Record<string, unknown>, path: string): unknown => {
  return normalizePath(path).reduce((result: unknown, key: string) => {
    if (result == null) return undefined
    return (result as Record<string, unknown>)[key]
  }, source)
}

const setValueByPath = (source: Record<string, unknown>, path: string, value: unknown): void => {
  const segments = normalizePath(path)
  if (!segments.length) return

  let current: Record<string, unknown> = source
  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1
    const nextSegment = segments[index + 1]
    const shouldCreateArray = nextSegment !== undefined && /^\d+$/.test(nextSegment)

    if (isLast) {
      current[segment] = value
      return
    }

    if (current[segment] === undefined || current[segment] === null) {
      current[segment] = shouldCreateArray ? [] : {}
    }

    current = current[segment] as Record<string, unknown>
  })
}

const replaceFormData = (value: Record<string, unknown>): void => {
  Object.keys(formData).forEach((key) => {
    delete formData[key]
  })
  Object.assign(formData, value)
}

const resolveSchemaValue = (value: unknown, item: FormSchemaItem, currentModel: Record<string, unknown>): unknown => {
  if (typeof value === 'function') {
    return value(currentModel, item)
  }
  return value
}

const buildModel = (source: Record<string, unknown> = {}): Record<string, unknown> => {
  const nextModel = cloneValue(source) as Record<string, unknown>

  props.schema.forEach((item: FormSchemaItem) => {
    if (!item.prop) return

    const currentValue = getValueByPath(nextModel, item.prop)
    if (currentValue === undefined && item.defaultValue !== undefined) {
      setValueByPath(nextModel, item.prop, resolveSchemaValue(item.defaultValue, item, nextModel))
    }
  })

  return nextModel
}

const syncFromModelValue = (value: Record<string, unknown> | undefined, updateInitial: boolean): void => {
  syncingFromProps.value = true
  const nextModel = buildModel(value ?? {})
  replaceFormData(nextModel)

  if (updateInitial) {
    initialModel.value = cloneValue(nextModel) as Record<string, unknown>
  }

  nextTick(() => {
    syncingFromProps.value = false
  })
}

watch(
  () => [props.modelValue, props.schema] as const,
  ([modelValue]) => {
    const nextModel = buildModel(modelValue ?? {})
    const isEcho = serializeModel(nextModel) === lastEmittedModel.value
    syncFromModelValue(nextModel, !isEcho)
  },
  { deep: true, immediate: true },
)

watch(
  formData,
  (value: Record<string, unknown>) => {
    if (syncingFromProps.value) return
    const nextModel = cloneValue(value)
    lastEmittedModel.value = serializeModel(nextModel)
    emit('update:modelValue', nextModel)
  },
  { deep: true },
)

const forwardedSlotNames = computed(() => Object.keys(slots).filter((name) => name !== 'action'))

const visibleSchema = computed(() => {
  return props.schema.filter((item) => {
    const isHidden = resolveSchemaValue(item.hidden, item, formData)
    const isVisible = item.visible === undefined ? true : resolveSchemaValue(item.visible, item, formData)
    return !isHidden && isVisible !== false
  })
})

const getDefaultSpan = () => {
  const columns = Number(props.columns) || 1
  return Math.max(1, Math.floor(24 / columns))
}

const getColProps = (item: FormSchemaItem): Record<string, unknown> => {
  const colProps = resolveSchemaValue(item.colProps, item, formData) as Record<string, unknown> | undefined
  if (colProps) return colProps
  return { span: (item.span as number) ?? getDefaultSpan() }
}

const getFieldValue = (prop: string): string | number | boolean | unknown[] | Record<string, unknown> | Date | undefined => {
  return getValueByPath(formData, prop) as string | number | boolean | unknown[] | Record<string, unknown> | Date | undefined
}

const setFieldValue = (prop: string, value: unknown, item: FormSchemaItem): void => {
  setValueByPath(formData, prop, value)
  emit('change', {
    prop,
    value,
    item,
    model: cloneValue(formData),
  })
}

const handleSubmit = async (): Promise<void> => {
  const elForm = formRef.value as InstanceType<typeof import('element-plus').ElForm> | null
  if (!elForm) return

  const valid = await elForm.validate().catch(() => false)
  if (!valid) return

  const nextModel = cloneValue(formData)
  emit('submit', nextModel)
}

const handleReset = async (): Promise<void> => {
  replaceFormData(cloneValue(initialModel.value) as Record<string, unknown>)
  await nextTick()
  const elForm = formRef.value as InstanceType<typeof import('element-plus').ElForm> | null
  elForm?.clearValidate()

  const nextModel = cloneValue(formData)
  lastEmittedModel.value = serializeModel(nextModel)
  emit('update:modelValue', nextModel)
  emit('reset', nextModel)
}

const validate = async (): Promise<boolean> => {
  const elForm = formRef.value as InstanceType<typeof import('element-plus').ElForm> | null
  if (!elForm) return false
  return elForm.validate()
}

const validateField = async (fieldProps: string[]): Promise<void> => {
  const elForm = formRef.value as InstanceType<typeof import('element-plus').ElForm> | null
  if (elForm) {
    await elForm.validateField(fieldProps)
  }
}

const clearValidate = (fieldProps?: string[]): void => {
  const elForm = formRef.value as InstanceType<typeof import('element-plus').ElForm> | null
  elForm?.clearValidate(fieldProps)
}

const scrollToField = (prop: string): void => {
  const elForm = formRef.value as InstanceType<typeof import('element-plus').ElForm> | null
  elForm?.scrollToField(prop)
}

const getFormData = (): unknown => cloneValue(formData)

const setFieldsValue = (values: Record<string, unknown>): void => {
  Object.entries(values ?? {}).forEach(([key, value]) => {
    setValueByPath(formData, key, cloneValue(value))
  })
}

defineExpose({
  formRef,
  formData,
  validate,
  validateField,
  resetFields: handleReset,
  clearValidate,
  scrollToField,
  getFormData,
  setFieldsValue,
  setFieldValue: (prop: string, value: unknown) => setValueByPath(formData, prop, cloneValue(value)),
})
</script>

<style lang="scss" scoped>
.pro-form {
  width: 100%;
}

.pro-form__actions {
  padding: 1rem 0;
}

.pro-form__actions :deep(.el-form-item__content) {
  justify-content: flex-end;
  gap: 12px;
}
</style>
