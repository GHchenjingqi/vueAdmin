<script setup lang="ts">
/**
 * 变体选择器（P2-T04）：每个 SKU 可选，价格/库存随之切换；
 * 不可购买 SKU 显示原因（stockNote）而非仅置灰。
 */
const props = defineProps<{ variants: { id: number; spec: Record<string, string>; inStock: boolean; stockNote?: string }[]; axes: string[]; modelValue: Record<string, string> }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Record<string, string>): void }>()

function optionsFor(axis: string): string[] {
  return [...new Set(props.variants.map((v) => v.spec[axis]).filter(Boolean))]
}

function choose(axis: string, value: string): void {
  emit('update:modelValue', { ...props.modelValue, [axis]: value })
}

function isUnavailable(axis: string, value: string): boolean {
  const next = { ...props.modelValue, [axis]: value }
  return !props.variants.some((v) => Object.entries(next).every(([k, val]) => v.spec[k] === val))
}

function noteFor(axis: string, value: string): string | undefined {
  const next = { ...props.modelValue, [axis]: value }
  const v = props.variants.find((x) => Object.entries(next).every(([k, val]) => x.spec[k] === val))
  return v?.stockNote
}
</script>

<template>
  <div class="space-y-4">
    <div v-for="axis in axes" :key="axis" class="space-y-2">
      <div class="text-xs font-semibold uppercase tracking-wide text-stone-500">{{ axis }}</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="opt in optionsFor(axis)"
          :key="opt"
          type="button"
          class="rounded-lg border px-3 py-1.5 text-sm capitalize transition"
          :class="[modelValue[axis] === opt ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-500', isUnavailable(axis, opt) ? 'opacity-40' : '']"
          :aria-pressed="modelValue[axis] === opt"
          @click="choose(axis, opt)"
        >
          {{ opt }}
          <span v-if="noteFor(axis, opt)" class="ml-1 text-[10px] opacity-70">{{ noteFor(axis, opt) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
