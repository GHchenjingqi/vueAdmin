<template>
  <div class="page-container currency-config-page">
    <el-row :gutter="16">
      <!-- 当前生效配置 -->
      <el-col :xs="24" :md="10">
        <el-card shadow="never" class="config-card">
          <template #header>
            <div class="card-title">
              <span>{{ t('shop.currencyConfig.currentTitle') }}</span>
              <el-tag v-if="current" type="success" size="small" disable-transitions>
                {{ t('shop.currencyConfig.active') }}
              </el-tag>
            </div>
          </template>

          <template v-if="current">
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item :label="t('shop.currencyConfig.code')">{{ current.code }}</el-descriptions-item>
              <el-descriptions-item :label="t('shop.currencyConfig.symbol')">{{ current.symbol }}</el-descriptions-item>
              <el-descriptions-item :label="t('shop.currencyConfig.locale')">{{ current.locale }}</el-descriptions-item>
              <el-descriptions-item :label="t('shop.currencyConfig.decimalDigits')">{{ current.decimalDigits }}</el-descriptions-item>
              <el-descriptions-item :label="t('shop.currencyConfig.preview')">{{ formatPreview(current) }}</el-descriptions-item>
            </el-descriptions>
          </template>
          <el-empty v-else :description="t('shop.currencyConfig.notConfigured')" :image-size="60" />

          <el-alert v-if="pending" type="warning" :closable="false" show-icon class="pending-alert" :title="t('shop.currencyConfig.pendingTitle')">
            <template #default>
              {{ t('shop.currencyConfig.pendingBody', { time: formatTime(pending.effectiveAt) }) }}
              （{{ pending.config.code }}）
            </template>
          </el-alert>
        </el-card>
      </el-col>

      <!-- 修改配置 -->
      <el-col :xs="24" :md="14">
        <el-card shadow="never" class="config-card">
          <template #header>
            <div class="card-title">{{ t('shop.currencyConfig.editTitle') }}</div>
          </template>

          <el-alert type="error" :closable="false" show-icon class="warning-alert" :title="t('shop.currencyConfig.warningTitle')">
            <template #default>
              <p class="warning-body">{{ t('shop.currencyConfig.warningBody') }}</p>
              <p class="warning-impact">
                <strong>{{ t('shop.currencyConfig.impact') }}：</strong>
                {{ t('shop.currencyConfig.impactDetail') }}
              </p>
            </template>
          </el-alert>

          <el-form ref="formRef" :model="form" :rules="rules" label-width="130px" label-position="right">
            <el-form-item :label="t('shop.currencyConfig.preset')">
              <el-select :model-value="''" :placeholder="t('shop.currencyConfig.preset')" clearable style="width: 100%" @change="applyPreset">
                <el-option v-for="p in CURRENCY_PRESETS" :key="p.code" :label="`${p.code} (${p.symbol})`" :value="p.code" />
              </el-select>
              <div class="form-tip">{{ t('shop.currencyConfig.presetTip') }}</div>
            </el-form-item>

            <el-row :gutter="12">
              <el-col :span="12">
                <el-form-item :label="t('shop.currencyConfig.code')" prop="code">
                  <el-input v-model="form.code" maxlength="3" :placeholder="'USD'" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item :label="t('shop.currencyConfig.symbol')" prop="symbol">
                  <el-input v-model="form.symbol" maxlength="8" :placeholder="'$'" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="12">
              <el-col :span="12">
                <el-form-item :label="t('shop.currencyConfig.decimalDigits')" prop="decimalDigits">
                  <el-input-number v-model="form.decimalDigits" :min="0" :max="4" controls-position="right" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item :label="t('shop.currencyConfig.symbolPosition')">
                  <el-radio-group v-model="form.symbolPosition">
                    <el-radio value="before">{{ t('shop.currencyConfig.before') }}</el-radio>
                    <el-radio value="after">{{ t('shop.currencyConfig.after') }}</el-radio>
                  </el-radio-group>
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="12">
              <el-col :span="12">
                <el-form-item :label="t('shop.currencyConfig.thousandsSeparator')">
                  <el-input v-model="form.thousandsSeparator" maxlength="4" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item :label="t('shop.currencyConfig.decimalSeparator')">
                  <el-input v-model="form.decimalSeparator" maxlength="4" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-form-item :label="t('shop.currencyConfig.locale')" prop="locale">
              <el-input v-model="form.locale" maxlength="20" placeholder="en-US" />
            </el-form-item>

            <el-form-item :label="t('shop.currencyConfig.preview')">
              <span class="preview-value">{{ formatPreview(form) }}</span>
              <span class="preview-note">{{ form.code }} · {{ form.locale }}</span>
            </el-form-item>

            <el-form-item :label="t('shop.currencyConfig.effectiveAt')">
              <el-date-picker
                v-model="effectiveAt"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss"
                :placeholder="t('shop.currencyConfig.effectiveAtPlaceholder')"
                style="width: 100%"
              />
            </el-form-item>

            <div class="ack-block">
              <el-checkbox v-model="confirmImpact">{{ t('shop.currencyConfig.confirmImpact') }}</el-checkbox>
              <el-checkbox v-model="ackNoConversion">{{ t('shop.currencyConfig.ackNoConversion') }}</el-checkbox>
            </div>

            <div class="submit-row">
              <el-button type="primary" :loading="saving" :disabled="!canSubmit" @click="handleSave">
                {{ t('shop.currencyConfig.save') }}
              </el-button>
              <span class="form-tip">{{ t('shop.currencyConfig.effectiveAtPlaceholder') }}</span>
            </div>
          </el-form>
        </el-card>
      </el-col>
    </el-row>

    <!-- 变更审计 -->
    <el-card shadow="never" class="config-card audit-card">
      <template #header>
        <div class="card-title">
          <span>{{ t('shop.currencyConfig.auditTitle') }}</span>
          <el-button link size="small" :loading="loadingChanges" @click="fetchChanges">
            {{ t('common.refresh') }}
          </el-button>
        </div>
      </template>
      <div class="audit-hint">{{ t('shop.currencyConfig.auditHint') }}</div>

      <el-table v-loading="loadingChanges" :data="changes" size="small" border stripe>
        <el-table-column prop="id" label="#" width="70" />
        <el-table-column :label="t('shop.currencyConfig.colTime')" width="175">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column :label="t('shop.currencyConfig.colOperator')" width="130">
          <template #default="{ row }">{{ row.operatorName || row.operatorId || t('shop.currencyConfig.system') }}</template>
        </el-table-column>
        <el-table-column :label="t('shop.currencyConfig.colChange')" min-width="170">
          <template #default="{ row }">
            <span class="old-code">{{ row.oldValue?.code ?? '—' }}</span>
            <span class="arrow">→</span>
            <span class="new-code">{{ row.newValue?.code ?? '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('shop.currencyConfig.colStatus')" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small" disable-transitions>{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('shop.currencyConfig.colEffectiveAt')" width="175">
          <template #default="{ row }">{{ formatTime(row.effectiveAt ?? row.appliedAt) }}</template>
        </el-table-column>
        <el-table-column :label="t('shop.currencyConfig.colActions')" width="100" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'applied' && row.oldValue && !row.rollbackOf" type="warning" link size="small" @click="onRollbackClick(row)">
              {{ t('shop.currencyConfig.rollback') }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>{{ t('shop.currencyConfig.noChanges') }}</template>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'
import { CURRENCY_PRESETS, buildCurrencyUpdatePayload, currencyApi, type ConfigChange, type CurrencyConfig, type CurrencySetting } from '@/api/shop'

const { t } = useI18n()

const current = ref<CurrencyConfig | null>(null)
const pending = ref<CurrencySetting['pending']>(null)
const changes = ref<ConfigChange[]>([])
const loadingChanges = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance | null>(null)
const effectiveAt = ref<string>('')
const confirmImpact = ref(false)
const ackNoConversion = ref(false)

const form = reactive<CurrencyConfig>({ ...CURRENCY_PRESETS[0] })

const canSubmit = computed(() => confirmImpact.value && ackNoConversion.value && !saving.value)

const rules = computed<FormRules>(() => ({
  code: [
    { required: true, message: t('shop.currencyConfig.validationCode'), trigger: 'blur' },
    { pattern: /^[A-Z]{3}$/, message: t('shop.currencyConfig.validationCode'), trigger: 'blur' },
  ],
  symbol: [{ required: true, message: t('shop.currencyConfig.validationSymbol'), trigger: 'blur' }],
  locale: [{ required: true, message: t('shop.currencyConfig.locale'), trigger: 'blur' }],
}))

/** 纯展示预览：与后端格式化口径一致（symbol 位置 + 千位/小数分隔符） */
function formatPreview(cfg: CurrencyConfig): string {
  const digits = Number.isInteger(cfg.decimalDigits) ? Math.min(Math.max(cfg.decimalDigits, 0), 4) : 2
  const [intPart, decPart] = (1234.5).toFixed(digits).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, cfg.thousandsSeparator || ',')
  const num = decPart ? grouped + (cfg.decimalSeparator || '.') + decPart : grouped
  return cfg.symbolPosition === 'after' ? `${num} ${cfg.symbol}` : `${cfg.symbol}${num}`
}

function formatTime(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

function statusLabel(status: ConfigChange['status']): string {
  const key = status === 'scheduled' ? 'statusScheduled' : status === 'rolled_back' ? 'statusRolledBack' : 'statusApplied'
  return t(`shop.currencyConfig.${key}`)
}

function statusTag(status: ConfigChange['status']): 'success' | 'warning' | 'info' {
  return status === 'applied' ? 'success' : status === 'scheduled' ? 'warning' : 'info'
}

function applyPreset(code: string | undefined): void {
  if (!code) return
  const preset = CURRENCY_PRESETS.find((p) => p.code === code)
  if (preset) Object.assign(form, preset)
}

async function fetchCurrent(): Promise<void> {
  try {
    const res = await currencyApi.get()
    current.value = res.data.current
    pending.value = res.data.pending
    if (res.data.current) Object.assign(form, { ...CURRENCY_PRESETS[0], ...res.data.current })
  } catch (err: unknown) {
    ElMessage.error(t('shop.currencyConfig.fetchFailed') + ': ' + getErrorMessage(err))
  }
}

async function fetchChanges(): Promise<void> {
  loadingChanges.value = true
  try {
    const res = await currencyApi.changes()
    changes.value = res.data ?? []
  } catch (err: unknown) {
    ElMessage.error(t('shop.currencyConfig.changesFailed') + ': ' + getErrorMessage(err))
  } finally {
    loadingChanges.value = false
  }
}

async function reloadAll(): Promise<void> {
  await Promise.all([fetchCurrent(), fetchChanges()])
}

async function handleSave(): Promise<void> {
  if (!canSubmit.value || !formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  const from = current.value?.code ?? '—'
  try {
    await ElMessageBox.confirm(t('shop.currencyConfig.saveConfirmBody', { from, to: form.code }), t('shop.currencyConfig.saveConfirmTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
    })
  } catch {
    return
  }

  saving.value = true
  try {
    const res = await currencyApi.update(buildCurrencyUpdatePayload({ ...form }, effectiveAt.value || null))
    ElMessage.success(t(res.data.scheduled ? 'shop.currencyConfig.scheduled' : 'shop.currencyConfig.saved'))
    confirmImpact.value = false
    ackNoConversion.value = false
    effectiveAt.value = ''
    await reloadAll()
  } catch (err: unknown) {
    ElMessage.error(t('shop.currencyConfig.saveFailed') + ': ' + getErrorMessage(err))
  } finally {
    saving.value = false
  }
}

/** el-table 的 slot row 为 DefaultRow，显式收窄为审计记录类型 */
function onRollbackClick(row: unknown): void {
  void handleRollback(row as ConfigChange)
}

async function handleRollback(row: ConfigChange): Promise<void> {
  try {
    await ElMessageBox.confirm(t('shop.currencyConfig.rollbackConfirmBody', { to: row.oldValue?.code ?? '—' }), t('shop.currencyConfig.rollbackConfirmTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
    })
  } catch {
    return
  }
  try {
    await currencyApi.rollback(row.id)
    ElMessage.success(t('shop.currencyConfig.rolledBack'))
    await reloadAll()
  } catch (err: unknown) {
    ElMessage.error(t('shop.currencyConfig.rollbackFailed') + ': ' + getErrorMessage(err))
  }
}

onMounted(reloadAll)
</script>

<style scoped>
.currency-config-page {
  padding: 4px;
}
.config-card {
  margin-bottom: 16px;
}
.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 600;
}
.pending-alert,
.warning-alert {
  margin-bottom: 16px;
}
.warning-alert :deep(.el-alert__description) {
  line-height: 1.6;
}
.warning-body {
  margin: 0 0 6px;
}
.warning-impact {
  margin: 0;
}
.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}
.preview-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--el-color-primary);
}
.preview-note {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ack-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  margin: 0 0 16px 130px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}
.submit-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: 130px;
}
.audit-hint {
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.old-code {
  color: var(--el-text-color-secondary);
}
.new-code {
  font-weight: 600;
}
.arrow {
  margin: 0 8px;
  color: var(--el-text-color-placeholder);
}
</style>
