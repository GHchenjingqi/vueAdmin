<template>
  <el-input v-bind="$attrs" :model-value="displayValue" @update:model-value="handleInput" @blur="handleBlur" />
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'

const MONEY_PATTERN = /^(0|[1-9]\d*)(\.\d{1,2})?$/

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
})

const emit = defineEmits(['update:modelValue'])

const displayValue = computed(() => {
  return props.modelValue == null ? '' : String(props.modelValue)
})

const normalizeIntegerPart = (value: string): string => {
  const normalized = value.replace(/^0+(?=\d)/, '')
  return normalized || '0'
}

const sanitizeMoneyInput = (value: string): string => {
  let normalized = String(value ?? '').replace(/[^\d.]/g, '')

  if (!normalized) {
    return ''
  }

  const firstDotIndex = normalized.indexOf('.')
  if (firstDotIndex === -1) {
    return normalizeIntegerPart(normalized)
  }

  const integerPart = normalizeIntegerPart(normalized.slice(0, firstDotIndex) || '0')
  const decimalPart = normalized
    .slice(firstDotIndex + 1)
    .replace(/\./g, '')
    .slice(0, 2)

  return `${integerPart}.${decimalPart}`
}

const handleInput = (value: string | number): void => {
  emit('update:modelValue', sanitizeMoneyInput(String(value)))
}

const handleBlur = (): void => {
  const value = displayValue.value
  if (!value) {
    return
  }

  if (!MONEY_PATTERN.test(value)) {
    ElMessage.error('请输入正确的金额格式')
    emit('update:modelValue', '')
  }
}
</script>
