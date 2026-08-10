<template>
  <div class="page-container">
    <ProTable
      :title="t('role.title')"
      :columns="columns"
      :search-fields="searchFields"
      :data="roles"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      column-settings-key="role_list"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">
          {{ t('role.addRole') }}
        </el-button>
      </template>

      <template #column-dataScope="{ row }">
        <el-tag :type="dataScopeType(row.dataScope)" size="small">
          {{ dataScopeLabel(row.dataScope) }}
        </el-tag>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
          {{ row.status === 1 ? t('role.enabled') : t('role.disabled') }}
        </el-tag>
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="primary" link size="small" :icon="Edit" @click="openEditDialog(row)">
            {{ t('common.edit') }}
          </el-button>
          <el-button type="warning" link size="small" :icon="Key" @click="openMenuDialog(row)">
            {{ t('role.assignPermission') }}
          </el-button>
          <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row)">
            {{ t('common.delete') }}
          </el-button>
        </div>
      </template>
    </ProTable>

    <FormDialog
      ref="formDialogRef"
      v-model="dialogVisible"
      v-model:form="form"
      :title="isEdit ? t('role.editRole') : t('role.addRole')"
      :loading="submitLoading"
      :schema="formSchema"
      @confirm="handleSubmit"
    />

    <el-dialog v-model="menuDialogVisible" :title="t('role.assignMenuPermission')" width="420px" :close-on-click-modal="false" destroy-on-close>
      <el-tree
        ref="menuTreeRef"
        :data="menuTree"
        show-checkbox
        node-key="id"
        :props="{ label: 'name', children: 'children' }"
        :default-checked-keys="checkedMenuIds"
        default-expand-all
        check-strictly
      >
        <template #default="{ data }">
          <span class="menu-tree-node">
            <span>{{ data.name }}</span>
            <el-tag v-if="data.type === 'F'" type="success" size="small" effect="plain">
              {{ t('menu.button') }}
            </el-tag>
            <el-tag v-else-if="data.type === 'C'" type="warning" size="small" effect="plain">
              {{ t('menu.catalog') }}
            </el-tag>
          </span>
        </template>
      </el-tree>

      <template #footer>
        <el-button @click="menuDialogVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="primary" :loading="menuSubmitLoading" @click="handleMenuSubmit">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { Plus, Edit, Delete, Key } from '@element-plus/icons-vue'
import { roleApi, menuApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import FormDialog from '@/components/FormDialog.vue'
import { useCrud } from '@/composables/useCrud'
import { useI18n } from '@/i18n'
import type { Role } from '@/types/api'

const { t } = useI18n()

const columns = computed(() => [
  { prop: 'index', label: t('common.index'), width: 60 },
  { prop: 'name', label: t('role.roleName'), minWidth: 150 },
  { prop: 'code', label: t('role.roleCode'), width: 150 },
  { prop: 'sort', label: t('common.sort'), width: 80, align: 'center' },
  { prop: 'dataScope', label: t('role.dataScope'), width: 120, align: 'center' },
  { prop: 'status', label: t('common.status'), width: 80, align: 'center' },
  { prop: 'remark', label: t('common.remark'), minWidth: 180, showOverflowTooltip: true },
  { prop: 'actions', label: t('common.actions'), width: 260, fixed: 'right' },
])

const searchFields = computed(() => [{ prop: 'name', label: t('role.roleName'), type: 'input', placeholder: t('role.inputRoleName') }])

const {
  list: roles,
  loading,
  pagination,
  searchParams,
  dialogVisible,
  isEdit,
  submitLoading,
  currentId,
  form,
  fetchData: fetchRoles,
  onQuery,
  openCreate: openCreateDialog,
  openEdit: openEditDialog,
  handleDelete,
} = useCrud<Role>({
  api: roleApi,
  defaultForm: { name: '', code: '', sort: 0, status: 1, dataScope: 1, remark: '' },
  defaultSearchParams: { name: '' },
  defaultPagination: { pageNum: 1, pageSize: 10 },
})

const formSchema = computed(() => [
  { prop: 'name', label: t('role.roleName'), type: 'input', placeholder: t('role.inputRoleName'), required: true, props: { maxlength: 30 } },
  { prop: 'code', label: t('role.roleCode'), type: 'input', placeholder: t('role.inputRoleCode'), required: true, props: { maxlength: 50 } },
  { prop: 'sort', label: t('common.sort'), type: 'number', props: { min: 0, max: 999 } },
  {
    prop: 'dataScope',
    label: t('role.dataScope'),
    type: 'radio',
    required: true,
    options: () => [
      { label: t('role.allData'), value: 1 },
      { label: t('role.deptData'), value: 2 },
      { label: t('role.deptAndBelowData'), value: 3 },
    ],
  },
  {
    prop: 'status',
    label: t('common.status'),
    type: 'switch',
    props: { activeText: t('common.enable'), inactiveText: t('common.disable') },
    activeValue: 1,
    inactiveValue: 0,
  },
  { prop: 'remark', label: t('common.remark'), type: 'textarea', placeholder: t('role.inputRemark'), props: { maxlength: 255, rows: 2 } },
])

const dataScopeType = (scope: number): 'success' | 'warning' | 'info' | undefined => {
  return scope === 1 ? undefined : scope === 2 ? 'warning' : 'info'
}

const dataScopeLabel = (scope: number) => {
  return scope === 1 ? t('role.all') : scope === 2 ? t('role.deptOnly') : t('role.deptAndBelow')
}

const menuDialogVisible = ref(false)
const menuTreeRef = ref<InstanceType<typeof import('element-plus').ElTree> | null>(null)
const menuTree = ref<{ id: number; name: string; children?: unknown[] }[]>([])
const checkedMenuIds = ref<number[]>([])
const menuSubmitLoading = ref(false)
const currentRoleId = ref<number | null>(null)

const fetchMenuTree = async () => {
  try {
    const res = await menuApi.list()
    menuTree.value = res.data
  } catch (err: unknown) {
    ElMessage.error(t('role.fetchMenuFailed') + ': ' + getErrorMessage(err))
  }
}

const handleSubmit = async (proForm: { formRef: { validate: () => Promise<boolean> }; getFormData: () => Record<string, unknown> } | null) => {
  if (!proForm) return
  const valid = await proForm.formRef.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    const payload = proForm.getFormData()
    if (isEdit.value) {
      await roleApi.update(currentId.value!, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await roleApi.create(payload)
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
    fetchRoles()
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err) || t('common.operationFailed'))
  } finally {
    submitLoading.value = false
  }
}

const openMenuDialog = async (row: Record<string, unknown>) => {
  const id = row.id as number
  currentRoleId.value = id
  try {
    const res = await roleApi.getById(id)
    checkedMenuIds.value = res.data.menus ? res.data.menus.map((m: { id: number }) => m.id) : []
  } catch {
    // 获取角色菜单失败，使用空列表
    checkedMenuIds.value = []
  }
  await fetchMenuTree()
  menuDialogVisible.value = true
}

const handleMenuSubmit = async () => {
  const treeRef = menuTreeRef.value as unknown as { getCheckedKeys: () => number[]; getHalfCheckedKeys: () => number[] }
  const checkedKeys = treeRef?.getCheckedKeys() || []
  const halfCheckedKeys = treeRef?.getHalfCheckedKeys() || []
  const allKeys = [...checkedKeys, ...halfCheckedKeys]

  menuSubmitLoading.value = true
  try {
    await roleApi.update(currentRoleId.value!, { menuIds: allKeys })
    ElMessage.success(t('role.permissionAssigned'))
    menuDialogVisible.value = false
    fetchRoles()
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err) || t('role.assignFailed'))
  } finally {
    menuSubmitLoading.value = false
  }
}

onMounted(() => {
  fetchRoles()
})
</script>

<style lang="scss" scoped>
.page-container {
  padding: 20px;
}

.menu-tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
