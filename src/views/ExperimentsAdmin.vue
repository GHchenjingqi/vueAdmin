<template>
  <div class="page-container">
    <el-card class="switch-card" shadow="never">
      <div class="switch-row">
        <div class="switch-meta">
          <div class="switch-title">{{ t('experiments.masterSwitch') }}</div>
          <div class="switch-desc">{{ t('experiments.masterSwitchDesc') }}</div>
        </div>
        <el-switch
          v-model="enabled"
          :loading="switchLoading"
          :active-text="t('experiments.enabled')"
          :inactive-text="t('experiments.disabled')"
          @change="onToggle"
        />
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <span>{{ t('experiments.title') }}</span>
      </template>
      <el-table v-loading="loading" :data="experiments" border stripe>
        <el-table-column prop="key" :label="t('experiments.key')" min-width="200" />
        <el-table-column prop="description" :label="t('experiments.description')" min-width="260" />
        <el-table-column :label="t('experiments.variants')" min-width="320">
          <template #default="{ row }">
            <el-tag v-for="v in row.variants" :key="v.id" class="variant-tag" size="small" :type="v.id === 'control' ? 'info' : 'primary'" disable-transitions>
              {{ v.id }} · {{ v.weight }}%
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="flag" :label="t('experiments.flag')" width="160" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { experimentApi, type ExperimentDef } from '@/api/experiments'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const enabled = ref(false)
const switchLoading = ref(false)
const loading = ref(false)
const experiments = ref<ExperimentDef[]>([])

const FLAG_KEY = 'ab_test'

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await experimentApi.list()
    enabled.value = res.data.enabled
    experiments.value = res.data.experiments
  } catch (err: unknown) {
    ElMessage.error(t('experiments.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const onToggle = async (val: unknown): Promise<void> => {
  const next = Boolean(val)
  switchLoading.value = true
  try {
    await experimentApi.setFlag(FLAG_KEY, next)
    enabled.value = next
    ElMessage.success(t('experiments.toggleSuccess', { state: next ? t('experiments.enabled') : t('experiments.disabled') }))
  } catch (err: unknown) {
    enabled.value = !next
    ElMessage.error(getErrorMessage(err))
  } finally {
    switchLoading.value = false
  }
}

onMounted(fetchList)
</script>

<style lang="scss" scoped>
.page-container {
  padding: 16px;
}
.switch-card {
  margin-bottom: 16px;
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.switch-title {
  font-weight: 600;
  font-size: 15px;
}
.switch-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.variant-tag {
  margin: 2px 6px 2px 0;
}
</style>
