<template>
  <el-input v-bind="$attrs" :model-value="modelValue" @update:model-value="updateValue" />
</template>

<script setup lang="ts">
defineProps({
  modelValue: { type: [String, Number], default: '' },
})

const emit = defineEmits(['update:modelValue'])

const updateValue = (value: string | number) => {
  emit('update:modelValue', value)
}
</script>
