<template>
  <el-dialog
    v-model="visible"
    :title="title"
    :width="width"
    :close-on-click-modal="false"
    :top="top"
    :destroy-on-close="destroyOnClose"
    :fullscreen="fullscreen"
    @closed="handleClosed"
  >
    <ProForm
      ref="proFormRef"
      v-model="localForm"
      :schema="formSchema"
      :rules="computedRules"
      :columns="columns"
      :gutter="gutter"
      :label-width="labelWidth"
      :submit-loading="loading"
      :show-actions="false"
      :disabled="disabled"
    >
      <template #content="slotProps">
        <slot name="content" v-bind="slotProps" />
      </template>
    </ProForm>

    <template #footer>
      <slot name="footer">
        <div class="dialog-footer">
          <el-button :disabled="loading" @click="visible = false">
            {{ t('common.cancel') }}
          </el-button>
          <el-button type="primary" :loading="loading" @click="handleConfirm">
            {{ confirmText || t('common.confirm') }}
          </el-button>
        </div>
      </slot>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import ProForm from '@/components/ProForm/index.vue'
import { useI18n } from '@/i18n'

interface FormField {
  prop: string
  label: string
  required?: boolean
  rules?: Array<Record<string, unknown>>
  [key: string]: unknown
}

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    title?: string
    width?: string
    top?: string
    destroyOnClose?: boolean
    loading?: boolean
    confirmText?: string
    disabled?: boolean
    fullscreen?: boolean
    schema?: FormField[]
    rules?: Record<string, unknown>
    columns?: number
    gutter?: number
    labelWidth?: string | number
    form?: Record<string, unknown>
  }>(),
  {
    title: '',
    width: '520px',
    top: '15vh',
    destroyOnClose: false,
    loading: false,
    confirmText: '',
    disabled: false,
    fullscreen: false,
    schema: () => [],
    rules: () => ({}),
    columns: 1,
    gutter: 10,
    labelWidth: '80px',
    form: () => ({}),
  },
)

const emit = defineEmits(['update:modelValue', 'update:form', 'confirm', 'closed'])

interface ProFormInstance {
  formRef: {
    clearValidate: () => void
    validate: () => Promise<boolean>
  }
  handleReset: () => void
}

const proFormRef = ref<ProFormInstance | null>(null)

const formSchema = computed(() => props.schema || [])
const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

/** 本地表单数据副本，避免直接修改prop */
const localForm = ref({ ...props.form })

/** 父组件更新form prop 时同步到本地 */
watch(
  () => props.form,
  (val) => {
    localForm.value = { ...val }
  },
  { deep: true },
)

/** 本地数据变化时同步回父组件*/
watch(
  localForm,
  (val) => {
    emit('update:form', val)
  },
  { deep: true },
)

/** 合并外部 rules 和schema 中的 rules */
const computedRules = computed(() => {
  const merged = { ...props.rules }
  if (props.schema?.length) {
    for (const field of props.schema) {
      const f = field as FormField
      if (f.required && !f.rules) {
        merged[f.prop] = [{ required: true, message: `请输入${f.label}`, trigger: 'blur' }]
      }
    }
  }
  return merged
})

/** 确认按钮回调：传选ProForm 实例便于外部校验 */
const handleConfirm = () => {
  emit('confirm', proFormRef.value)
}

/** 对话框关闭后重置表单校验 */
const handleClosed = () => {
  proFormRef.value?.formRef?.clearValidate()
  emit('closed')
}

/**
 * 校验表单并提交
 * @param submitFn - 提交函数
 * @returns 是否校验通过
 */
async function validateAndSubmit(submitFn: () => Promise<void>): Promise<boolean> {
  if (!proFormRef.value?.formRef) return false
  try {
    await proFormRef.value.formRef.validate()
    await submitFn()
    return true
  } catch {
    return false
  }
}

/**
 * 重置表单
 */
function resetForm() {
  proFormRef.value?.handleReset()
}

defineExpose({ proFormRef, validateAndSubmit, resetForm })
</script>

<style lang="scss" scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
