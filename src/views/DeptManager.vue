<template>
  <div class="page-container">
    <ProTable
      :title="t('dept.title')"
      :columns="columns"
      :search-fields="searchFields"
      :search-params="searchParams"
      :data="deptTree"
      :loading="loading"
      :pagination="pagination"
      :show-pagination="false"
      :show-header="true"
      row-key="id"
      column-settings-key="dept_list"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog()">
          {{ t('dept.addDept') }}
        </el-button>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
          {{ row.status === 1 ? t('dept.enabled') : t('dept.disabled') }}
        </el-tag>
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="primary" link size="small" :icon="Edit" @click="openEditDialog(row)">
            {{ t('common.edit') }}
          </el-button>
          <el-button type="primary" link size="small" :icon="Plus" @click="openCreateDialog(row.id)">
            {{ t('common.add') }}
          </el-button>
          <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row)">
            {{ t('common.delete') }}
          </el-button>
        </div>
      </template>
    </ProTable>

    <FormDialog
      v-model="dialogVisible"
      v-model:form="form"
      :title="isEdit ? t('dept.editDept') : t('dept.addDept')"
      :loading="submitLoading"
      :schema="formSchema"
      @confirm="handleSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { deptApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import FormDialog from '@/components/FormDialog.vue'
import { useI18n } from '@/i18n'
import type { Department } from '@/types/api'

const { t } = useI18n()

const deptTree = ref<Department[]>([])
const optionTree = ref<{ label: string; value: number }[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const currentId = ref<number | null>(null)

const form = ref<Partial<Department>>({
  parentId: null,
  name: '',
  sort: 0,
  leader: '',
  phone: '',
  email: '',
  status: 1,
})

const pagination = { pageNum: 1, pageSize: 9999, total: 0 }

const searchFields = computed(() => [{ prop: 'name', label: t('dept.deptName'), type: 'input', placeholder: t('dept.searchDeptName') }])

const searchParams = reactive<{ name: string }>({ name: '' })

const allDepts = ref<Department[]>([])

const filterTree = (nodes: Department[], keyword: string): Department[] => {
  if (!keyword) return nodes
  const result: Department[] = []
  for (const node of nodes) {
    const children = node.children ? filterTree(node.children, keyword) : []
    if (node.name.toLowerCase().includes(keyword.toLowerCase()) || children.length) {
      result.push({ ...node, children: children.length ? children : node.children })
    }
  }
  return result
}

const onQuery = (params: { searchParams?: Record<string, unknown> }) => {
  if (params.searchParams) {
    Object.assign(searchParams, params.searchParams)
  }
  deptTree.value = filterTree(allDepts.value, searchParams.name || '')
}

const columns = computed(() => [
  { prop: 'index', label: t('common.index'), width: 60 },
  { prop: 'name', label: t('dept.deptName'), minWidth: 200 },
  { prop: 'sort', label: t('common.sort'), width: 80, align: 'center' as const },
  { prop: 'leader', label: t('dept.leader'), width: 120 },
  { prop: 'phone', label: t('dept.phone'), width: 140 },
  { prop: 'email', label: t('dept.email'), minWidth: 180 },
  { prop: 'status', label: t('common.status'), width: 80, align: 'center' as const },
  { prop: 'actions', label: t('common.actions'), width: 220, fixed: 'right' as const },
])

const formSchema = computed(() => [
  {
    prop: 'parentId',
    label: t('dept.parentDept'),
    type: 'select',
    placeholder: t('dept.selectParentDept'),
    props: { filterable: true, clearable: true },
    options: () => optionTree.value,
  },
  { prop: 'name', label: t('dept.deptName'), type: 'input', placeholder: t('dept.inputDeptName'), required: true, props: { maxlength: 50 } },
  { prop: 'sort', label: t('common.sort'), type: 'number', props: { min: 0, max: 999 } },
  { prop: 'leader', label: t('dept.leader'), type: 'input', placeholder: t('dept.inputLeader'), props: { maxlength: 50 } },
  { prop: 'phone', label: t('dept.phone'), type: 'input', placeholder: t('dept.inputPhone'), props: { maxlength: 20 } },
  { prop: 'email', label: t('dept.email'), type: 'input', placeholder: t('dept.inputEmail'), props: { maxlength: 100 } },
  {
    prop: 'status',
    label: t('common.status'),
    type: 'switch',
    props: { activeText: t('common.enable'), inactiveText: t('common.disable') },
    activeValue: 1,
    inactiveValue: 0,
  },
])

const fetchDepts = async () => {
  loading.value = true
  try {
    const res = await deptApi.list()
    allDepts.value = res.data || []
    const res2 = await deptApi.list()
    const tree = res2.data || []

    const flattenTree = (nodes: Department[], level = 0): { label: string; value: number }[] => {
      const result: { label: string; value: number }[] = []
      for (const node of nodes) {
        result.push({ label: '\u3000'.repeat(level) + node.name, value: node.id })
        if (node.children && node.children.length) {
          result.push(...flattenTree(node.children, level + 1))
        }
      }
      return result
    }

    optionTree.value = flattenTree(tree)
    deptTree.value = filterTree(allDepts.value, searchParams.name || '')
  } catch (err: unknown) {
    ElMessage.error(t('dept.fetchListFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const openCreateDialog = (parentId?: number | null) => {
  isEdit.value = false
  currentId.value = null
  form.value = { parentId: parentId ?? null, name: '', sort: 0, leader: '', phone: '', email: '', status: 1 }
  dialogVisible.value = true
}

const openEditDialog = (row: Record<string, unknown>) => {
  isEdit.value = true
  currentId.value = row.id as number
  form.value = {
    parentId: (row.parentId as number) ?? null,
    name: (row.name as string) ?? '',
    sort: (row.sort as number) ?? 0,
    leader: (row.leader as string) ?? '',
    phone: (row.phone as string) ?? '',
    email: (row.email as string) ?? '',
    status: (row.status as number) ?? 1,
  }
  dialogVisible.value = true
}

const handleSubmit = async (proForm: { formRef: { validate: () => Promise<boolean> }; getFormData: () => Record<string, unknown> } | null) => {
  if (!proForm) return
  const valid = await proForm.formRef.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    const payload = proForm.getFormData()
    if (isEdit.value) {
      await deptApi.update(currentId.value!, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await deptApi.create(payload)
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
    fetchDepts()
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err) || t('common.operationFailed'))
  } finally {
    submitLoading.value = false
  }
}

const handleDelete = (row: Record<string, unknown>): void => {
  const dept = row as unknown as Department
  ElMessageBox.confirm(`${t('dept.deleteConfirm')}「${dept.name}」？${t('dept.deleteWarning')}`, t('common.tip'), {
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
    type: 'warning',
  })
    .then(async () => {
      try {
        await deptApi.delete(row.id as number)
        ElMessage.success(t('messages.deleteSuccess'))
        fetchDepts()
      } catch (err: unknown) {
        ElMessage.error(t('messages.deleteFailed') + ': ' + getErrorMessage(err))
      }
    })
    .catch(() => {
      // 用户取消删除
    })
}

onMounted(fetchDepts)
</script>

<style lang="scss" scoped>
.page-container {
  padding: 20px;
}

.table-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
