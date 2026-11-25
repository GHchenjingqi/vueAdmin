<template>
  <el-dialog
    :model-value="modelValue"
    :title="title || (scope === 'pose' ? t('portal.posePickerTitle') : t('portal.characterPickerTitle'))"
    width="860px"
    top="6vh"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="picker-toolbar">
      <el-input v-model="keyword" :placeholder="t('portal.pickerSearchPlaceholder')" clearable style="width: 320px" @keyup.enter="load" @clear="load">
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-button :loading="loading" @click="load">{{ t('portal.pickerSearch') }}</el-button>
      <span class="picker-count">{{ items.length }} {{ t('portal.pickerUnit') }}</span>
    </div>
    <div v-loading="loading" class="picker-grid">
      <button v-for="(item, index) in items" :key="item.image.url + '-' + index" type="button" class="picker-item" @click="$emit('select', item.image)">
        <el-image :src="item.image.url" fit="cover" class="picker-image" />
        <span class="picker-label" :title="item.title">{{ item.title }}</span>
      </button>
      <div v-if="!loading && !items.length" class="picker-empty">{{ t('portal.pickerEmpty') }}</div>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { portalApi, promptApi } from '@/api'
import type { PromptImageItem } from '@/api/prompt'
import { useI18n } from '@/i18n'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    scope: 'character' | 'pose'
    source?: 'portal' | 'admin'
    title?: string
  }>(),
  { source: 'portal', title: '' },
)
defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'select', image: PromptImageItem): void
}>()

const { t } = useI18n()
const keyword = ref('')
const loading = ref(false)
const items = ref<Array<{ image: PromptImageItem; title: string }>>([])

const load = async (): Promise<void> => {
  loading.value = true
  try {
    const params = {
      page: 1,
      pageSize: 60,
      keyword: keyword.value.trim() || undefined,
      scope: props.scope === 'pose' ? ('pose' as const) : undefined,
    }
    const res = props.source === 'admin' ? await promptApi.getPrompts(params) : await portalApi.getPrompts(params)
    items.value = res.data.rows
      .flatMap((prompt) => (prompt.images || []).map((image) => ({ image, title: prompt.title })))
      .filter((item) => Boolean(item.image.url))
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) void load()
  },
  { immediate: true },
)
</script>

<style scoped lang="scss">
.picker-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.picker-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
  min-height: 220px;
  max-height: 55vh;
  overflow-y: auto;
}

.picker-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-bg-color);
  cursor: pointer;
  text-align: left;
}

.picker-item:hover {
  border-color: var(--el-color-primary);
}

.picker-image {
  width: 100%;
  height: 110px;
  display: block;
  border-radius: 4px;
}

.picker-label {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-empty {
  grid-column: 1 / -1;
  padding: 60px 0;
  text-align: center;
  color: var(--el-text-color-secondary);
}
</style>
