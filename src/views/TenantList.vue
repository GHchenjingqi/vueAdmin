<template>
  <div class="page-container">
    <ProTable
      :title="t('tenant.title')"
      :columns="columns"
      :search-fields="searchFields"
      :data="tenants"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      column-settings-key="tenant_list"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button v-permission="['system:tenant:provision']" type="primary" :icon="Plus" @click="handleOpenProvision">
          {{ t('tenant.provision') }}
        </el-button>
        <el-button :icon="Refresh" @click="fetchTenants">
          {{ t('common.refresh') }}
        </el-button>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
      </template>

      <!-- 菜单副本数 = 开通是否完整；历史数据/失败事务会留在这里露出来 -->
      <template #column-menuCount="{ row }">
        <el-tag v-if="Number(row.menuCount) > 0" type="success" size="small">{{ row.menuCount }}</el-tag>
        <el-tooltip v-else :content="t('tenant.menuMissingTip')" placement="top">
          <el-tag type="danger" size="small">0</el-tag>
        </el-tooltip>
      </template>

      <template #column-brand="{ row }">
        <span>{{ brandOf(row).title || row.name }}</span>
      </template>

      <template #column-actions="{ row }">
        <el-button v-permission="['system:tenant:edit']" link type="primary" :icon="Edit" @click="handleOpenEdit(row)">
          {{ t('common.edit') }}
        </el-button>
        <el-button v-if="Number(row.status) === 1" v-permission="['system:tenant:disable']" link type="warning" @click="handleSetStatus(row, 0)">
          {{ t('tenant.disable') }}
        </el-button>
        <el-button v-if="Number(row.status) === 1" v-permission="['system:tenant:disable']" link type="danger" @click="handleSetStatus(row, 2)">
          {{ t('tenant.freeze') }}
        </el-button>
        <el-button v-if="Number(row.status) !== 1" v-permission="['system:tenant:disable']" link type="success" @click="handleSetStatus(row, 1)">
          {{ t('tenant.enable') }}
        </el-button>
      </template>
    </ProTable>

    <!-- 开通向导：基本信息 → 品牌 → 管理员账号 -->
    <el-dialog v-model="provisionVisible" :title="t('tenant.provision')" width="640px" :close-on-click-modal="false">
      <el-steps :active="provisionStep" align-center finish-status="success" style="margin-bottom: 24px">
        <el-step :title="t('tenant.stepBasic')" />
        <el-step :title="t('tenant.stepBrand')" />
        <el-step :title="t('tenant.stepAdmin')" />
      </el-steps>

      <el-form :model="provisionForm" label-width="110px">
        <template v-if="provisionStep === 0">
          <el-form-item :label="t('tenant.name')" required>
            <el-input v-model="provisionForm.name" :placeholder="t('tenant.namePlaceholder')" maxlength="100" />
          </el-form-item>
          <el-form-item :label="t('tenant.code')" required>
            <el-input v-model="provisionForm.code" :placeholder="t('tenant.codePlaceholder')" maxlength="30" />
          </el-form-item>
          <el-form-item :label="t('tenant.plan')">
            <el-select v-model="provisionForm.planId" clearable style="width: 100%" :placeholder="t('tenant.planDefault')">
              <el-option v-for="p in plans" :key="p.id" :label="p.name || p.code" :value="p.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('tenant.expiresAt')">
            <el-date-picker v-model="provisionForm.expiresAt" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
        </template>

        <template v-else-if="provisionStep === 1">
          <el-form-item :label="t('tenant.brandTitle')">
            <el-input v-model="provisionForm.brand.title" :placeholder="t('tenant.brandTitlePlaceholder')" maxlength="50" />
          </el-form-item>
          <el-form-item :label="t('tenant.brandLogo')">
            <el-input v-model="provisionForm.brand.logo" :placeholder="t('tenant.brandLogoPlaceholder')" />
          </el-form-item>
          <el-form-item :label="t('tenant.brandColor')">
            <el-color-picker v-model="provisionForm.brand.color" />
            <span class="brand-hint">{{ t('tenant.brandHint') }}</span>
          </el-form-item>
          <el-form-item :label="t('tenant.deptName')">
            <el-input v-model="provisionForm.deptName" :placeholder="t('tenant.deptNamePlaceholder')" maxlength="50" />
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item :label="t('tenant.adminUsername')" required>
            <el-input v-model="provisionForm.admin.username" maxlength="20" />
          </el-form-item>
          <el-form-item :label="t('tenant.adminNickname')">
            <el-input v-model="provisionForm.admin.nickname" maxlength="30" />
          </el-form-item>
          <el-form-item :label="t('tenant.adminEmail')">
            <el-input v-model="provisionForm.admin.email" />
          </el-form-item>
          <el-form-item :label="t('tenant.adminPhone')">
            <el-input v-model="provisionForm.admin.phone" maxlength="20" />
          </el-form-item>
          <el-form-item :label="t('tenant.adminPassword')" required>
            <el-input v-model="provisionForm.admin.password" type="password" show-password maxlength="64" />
          </el-form-item>
          <el-alert :title="t('tenant.adminPasswordTip')" type="info" :closable="false" show-icon />
        </template>
      </el-form>

      <template #footer>
        <el-button v-if="provisionStep > 0" @click="provisionStep--">{{ t('tenant.prevStep') }}</el-button>
        <el-button v-if="provisionStep < 2" type="primary" @click="nextProvisionStep">{{ t('tenant.nextStep') }}</el-button>
        <el-button v-if="provisionStep === 2" type="primary" :loading="provisioning" @click="handleProvision">
          {{ t('tenant.provision') }}
        </el-button>
        <el-button @click="provisionVisible = false">{{ t('common.cancel') }}</el-button>
      </template>
    </el-dialog>

    <!-- 编辑：名称、品牌与套餐有效期 -->
    <el-dialog v-model="editVisible" :title="t('tenant.edit')" width="520px">
      <el-form :model="editForm" label-width="110px">
        <el-form-item :label="t('tenant.name')">
          <el-input v-model="editForm.name" maxlength="100" />
        </el-form-item>
        <el-form-item :label="t('tenant.brandTitle')">
          <el-input v-model="editForm.brand.title" maxlength="50" />
        </el-form-item>
        <el-form-item :label="t('tenant.brandLogo')">
          <el-input v-model="editForm.brand.logo" />
        </el-form-item>
        <el-form-item :label="t('tenant.brandColor')">
          <el-color-picker v-model="editForm.brand.color" />
        </el-form-item>
        <el-form-item :label="t('tenant.expiresAt')">
          <el-date-picker v-model="editForm.expiresAt" type="date" value-format="YYYY-MM-DD" clearable style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" :loading="saving" @click="handleSaveEdit">{{ t('common.save') }}</el-button>
        <el-button @click="editVisible = false">{{ t('common.cancel') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Refresh } from '@element-plus/icons-vue'
import ProTable from '@/components/ProTable/index.vue'
import { tenantApi, type TenantRow } from '@/api/tenant'
import { billingApi, type PlanSummary } from '@/api/billing'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const { t } = useI18n()

interface BrandForm {
  title: string
  logo: string
  color: string
}

const emptyBrand = (): BrandForm => ({ title: '', logo: '', color: '' })

const loading = ref(false)
const tenants = ref<TenantRow[]>([])
const plans = ref<PlanSummary[]>([])
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive<{ name: string; code: string; status: number | '' }>({ name: '', code: '', status: '' })

const provisionVisible = ref(false)
const provisionStep = ref(0)
const provisioning = ref(false)
const provisionForm = reactive({
  name: '',
  code: '',
  planId: undefined as number | undefined,
  expiresAt: '' as string,
  deptName: '',
  brand: emptyBrand(),
  admin: { username: '', nickname: '', email: '', phone: '', password: '' },
})

const editVisible = ref(false)
const saving = ref(false)
const editForm = reactive<{ id: number; name: string; brand: BrandForm; expiresAt: string }>({ id: 0, name: '', brand: emptyBrand(), expiresAt: '' })

const searchFields = computed(() => [
  { prop: 'name', label: t('tenant.name'), type: 'input', placeholder: t('tenant.namePlaceholder') },
  { prop: 'code', label: t('tenant.code'), type: 'input', placeholder: t('tenant.codePlaceholder') },
  { prop: 'status', label: t('common.status'), type: 'select', options: statusOptions(), placeholder: t('common.all') },
])

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 80 },
  { prop: 'name', label: t('tenant.name'), minWidth: 150 },
  { prop: 'code', label: t('tenant.code'), width: 140 },
  { prop: 'brand', label: t('tenant.brand'), minWidth: 140 },
  { prop: 'status', label: t('common.status'), width: 100 },
  { prop: 'menuCount', label: t('tenant.menuCount'), width: 110 },
  { prop: 'expiresAt', label: t('tenant.expiresAt'), width: 130, formatter: (row: Record<string, unknown>) => formatDate(row.expiresAt) },
  { prop: 'actions', label: t('common.operation'), width: 220, fixed: 'right', align: 'center' },
])

/** 状态语义：1=启用 0=停用（可恢复）2=冻结（保留数据，仅平台解冻） */
function statusOptions() {
  return [
    { label: t('tenant.statusEnabled'), value: 1 },
    { label: t('tenant.statusDisabled'), value: 0 },
    { label: t('tenant.statusFrozen'), value: 2 },
  ]
}

function statusLabel(status: unknown): string {
  const found = statusOptions().find((item) => item.value === Number(status))
  return found ? found.label : String(status)
}

function statusTagType(status: unknown): 'success' | 'info' | 'danger' {
  if (Number(status) === 1) return 'success'
  if (Number(status) === 0) return 'info'
  return 'danger'
}

function brandOf(row: Record<string, unknown>): { title?: string } {
  const settings = row.settings as { brand?: { title?: string } } | null
  return settings?.brand ?? {}
}

function formatDate(value: unknown): string {
  if (!value) return '-'
  return String(new Date(String(value)).toLocaleDateString())
}

function onQuery({
  pagination: newPagination,
  searchParams: newSearchParams,
}: {
  pagination: { pageNum: number; pageSize: number; total: number }
  searchParams?: Record<string, unknown>
}): void {
  Object.assign(pagination, newPagination)
  if (newSearchParams) Object.assign(searchParams, newSearchParams)
  fetchTenants()
}

async function fetchTenants(): Promise<void> {
  loading.value = true
  try {
    const res = await tenantApi.list({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
      name: searchParams.name || undefined,
      code: searchParams.code || undefined,
      status: searchParams.status === '' ? undefined : searchParams.status,
    })
    tenants.value = res.data.rows
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('tenant.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

async function fetchPlans(): Promise<void> {
  try {
    const res = await billingApi.getPlans()
    plans.value = res.data
  } catch {
    // 套餐列表取不到时向导仍可走 free 默认，不阻塞开通
  }
}

function handleOpenProvision(): void {
  provisionStep.value = 0
  Object.assign(provisionForm, {
    name: '',
    code: '',
    planId: undefined,
    expiresAt: '',
    deptName: '',
    brand: emptyBrand(),
    admin: { username: '', nickname: '', email: '', phone: '', password: '' },
  })
  provisionVisible.value = true
  if (plans.value.length === 0) fetchPlans()
}

function nextProvisionStep(): void {
  if (provisionStep.value === 0) {
    if (!provisionForm.name.trim() || !provisionForm.code.trim()) {
      ElMessage.warning(t('tenant.basicRequired'))
      return
    }
    // 编码是租户的机器标识，录入时大小写随手写很常见，这里直接归一而不是报错
    provisionForm.code = provisionForm.code.trim().toLowerCase()
    if (!/^[a-z][a-z0-9-]{1,29}$/.test(provisionForm.code)) {
      ElMessage.warning(t('tenant.codeInvalid'))
      return
    }
  }
  provisionStep.value += 1
}

async function handleProvision(): Promise<void> {
  if (!provisionForm.admin.username.trim() || provisionForm.admin.password.length < 8) {
    ElMessage.warning(t('tenant.adminRequired'))
    return
  }
  provisioning.value = true
  try {
    await tenantApi.provision({
      name: provisionForm.name.trim(),
      code: provisionForm.code.trim(),
      planId: provisionForm.planId,
      expiresAt: provisionForm.expiresAt || undefined,
      deptName: provisionForm.deptName || undefined,
      brand: { title: provisionForm.brand.title || undefined, logo: provisionForm.brand.logo || undefined, color: provisionForm.brand.color || undefined },
      admin: {
        username: provisionForm.admin.username.trim(),
        nickname: provisionForm.admin.nickname || undefined,
        email: provisionForm.admin.email || undefined,
        phone: provisionForm.admin.phone || undefined,
        password: provisionForm.admin.password,
      },
    })
    ElMessage.success(t('tenant.provisionSuccess'))
    provisionVisible.value = false
    fetchTenants()
  } catch (err: unknown) {
    ElMessage.error(t('tenant.provisionFailed') + ': ' + getErrorMessage(err))
  } finally {
    provisioning.value = false
  }
}

function handleOpenEdit(rawRow: Record<string, unknown>): void {
  const row = rawRow as unknown as TenantRow
  editForm.id = row.id
  editForm.name = row.name
  editForm.brand = { ...emptyBrand(), ...brandOf(row) } as BrandForm
  editForm.expiresAt = row.expiresAt ? String(new Date(row.expiresAt).toISOString().slice(0, 10)) : ''
  editVisible.value = true
}

async function handleSaveEdit(): Promise<void> {
  saving.value = true
  try {
    await tenantApi.update(editForm.id, {
      name: editForm.name,
      brand: { title: editForm.brand.title || undefined, logo: editForm.brand.logo || undefined, color: editForm.brand.color || undefined },
      expiresAt: editForm.expiresAt || null,
    })
    ElMessage.success(t('tenant.saveSuccess'))
    editVisible.value = false
    fetchTenants()
  } catch (err: unknown) {
    ElMessage.error(t('tenant.saveFailed') + ': ' + getErrorMessage(err))
  } finally {
    saving.value = false
  }
}

async function handleSetStatus(rawRow: Record<string, unknown>, status: number): Promise<void> {
  const row = rawRow as unknown as TenantRow
  const actionLabel = status === 1 ? t('tenant.enable') : status === 2 ? t('tenant.freeze') : t('tenant.disable')
  try {
    await ElMessageBox.confirm(`${actionLabel}「${row.name}」？${t('tenant.statusEffect')}`, t('common.tip'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await tenantApi.setStatus(row.id, status)
    ElMessage.success(t('tenant.statusUpdated'))
    fetchTenants()
  } catch (err: unknown) {
    ElMessage.error(t('tenant.statusFailed') + ': ' + getErrorMessage(err))
  }
}

onMounted(fetchTenants)
</script>

<style scoped>
.brand-hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
