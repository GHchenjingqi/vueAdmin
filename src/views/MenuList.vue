<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('menu.title')"
      :columns="columns"
      :data="filteredMenuTree"
      :loading="loading"
      :show-pagination="false"
      :pagination="{ pageNum: 1, pageSize: 10, total: 0 }"
      :search-params="searchParams"
      :search-fields="searchFields"
      :show-header="true"
      row-key="id"
      :tree-props="{ children: 'children' }"
      column-settings-key="menu_list"
      @query="onQuery($event)"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog()">
          {{ t('menu.addMenu') }}
        </el-button>
      </template>

      <template #column-name="{ row }">
        <MenuIcon :name="row.icon" style="margin-right: 6px; vertical-align: middle" />
        <span>{{ row.name }}</span>
      </template>

      <template #column-type="{ row }">
        <el-tag :type="row.type === 'C' ? 'warning' : row.type === 'F' ? 'success' : 'primary'" size="small">
          {{ row.type === 'C' ? t('menu.catalog') : row.type === 'F' ? t('menu.button') : t('menu.menu') }}
        </el-tag>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
          {{ row.status === 1 ? t('common.enable') : t('common.disable') }}
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

    <el-dialog v-model="dialogVisible" :title="isEdit ? t('menu.editMenu') : t('menu.addMenu')" width="600px" :close-on-click-modal="false" destroy-on-close>
      <ProForm ref="proFormRef" v-model="form" :schema="formSchema" :columns="1" :show-actions="false" label-width="100px" />

      <template #footer>
        <el-button @click="dialogVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { menuApi } from '@/api'
import type { Menu } from '@/types/api'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import ProForm from '@/components/ProForm/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

interface MenuOption {
  id: number
  name: string
  children?: MenuOption[]
}

const loading = ref(false)
const menuTree = ref<Menu[]>([])
const optionTree = ref<MenuOption[]>([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const proFormRef = ref<InstanceType<typeof ProForm> | null>(null)
const currentId = ref<number | null>(null)

const searchParams = reactive({ keyword: '', type: '', status: '' })

const searchFields = computed(() => [
  { prop: 'keyword', label: t('menu.menuName'), type: 'input', placeholder: t('menu.inputMenuName') },
  {
    prop: 'type',
    label: t('menu.type'),
    type: 'select',
    placeholder: t('common.all'),
    options: () => [
      { label: t('menu.catalog'), value: 'C' },
      { label: t('menu.menu'), value: 'M' },
      { label: t('menu.button'), value: 'F' },
    ],
  },
  {
    prop: 'status',
    label: t('common.status'),
    type: 'select',
    placeholder: t('menu.allStatus'),
    options: () => [
      { label: t('common.enable'), value: '1' },
      { label: t('common.disable'), value: '0' },
    ],
  },
])

function filterTree(nodes: Menu[], keyword: string, type: string, status: string): Menu[] {
  if (!nodes) return []
  const result: Menu[] = []
  for (const node of nodes) {
    const matchName = !keyword || (node.name && node.name.includes(keyword))
    const matchType = !type || node.type === type
    const matchStatus = !status || String(node.status) === status
    const selfMatch = matchName && matchType && matchStatus

    const filteredChildren = node.children ? filterTree(node.children, keyword, type, status) : []

    if (selfMatch || filteredChildren.length > 0) {
      result.push({ ...node, children: selfMatch ? node.children : filteredChildren })
    }
  }
  return result
}

const filteredMenuTree = computed<Menu[]>(() => {
  return filterTree(menuTree.value, searchParams.keyword, searchParams.type, searchParams.status)
})

const onQuery = (_params?: Record<string, unknown>): void => {
  // 前端过滤
}

const columns = computed(() => [
  { prop: 'name', label: t('menu.menuName'), minWidth: 150 },
  { prop: 'icon', label: t('menu.icon'), width: 100 },
  { prop: 'type', label: t('menu.type'), width: 80, align: 'center' },
  { prop: 'path', label: t('menu.routePath'), width: 180 },
  { prop: 'component', label: t('menu.componentPath'), minWidth: 150, showOverflowTooltip: true },
  { prop: 'sort', label: t('common.sort'), width: 70, align: 'center' },
  { prop: 'status', label: t('common.status'), width: 80, align: 'center' },
  { prop: 'actions', label: t('common.actions'), fixed: 'right' },
])

const componentOptions = [
  'views/Dashboard.vue',
  'views/UserList.vue',
  'views/SystemLog.vue',
  'views/MenuList.vue',
  'views/LoginPage.vue',
  'views/Register.vue',
  'views/NotFound.vue',
  'views/Forbidden.vue',
]

const iconOptions = [
  'Odometer',
  'User',
  'Document',
  'Grid',
  'Setting',
  'Files',
  'Key',
  'EditPen',
  'WarningFilled',
  'CircleCloseFilled',
  'Menu',
  'HomeFilled',
  'Tools',
  'DataBoard',
  'ChatDotSquare',
  'Notification',
  'BellFilled',
  'ShoppingCart',
  'TrendCharts',
  'Message',
  'Refresh',
  'Search',
  'Plus',
  'Edit',
  'Delete',
]

interface MenuForm {
  parentId: number | null
  name: string
  type: string
  path: string
  component: string
  icon: string
  permission: string
  sort: number
  status: number
  hidden: number
}

let form = reactive<MenuForm>({
  parentId: null,
  name: '',
  type: 'M',
  path: '',
  component: '',
  icon: '',
  permission: '',
  sort: 0,
  status: 1,
  hidden: 0,
})

const formSchema = computed(() => [
  {
    prop: 'parentId',
    label: t('menu.parentMenu'),
    type: 'tree-select',
    placeholder: t('menu.topMenu'),
    props: { filterable: true, clearable: true },
    optionLabel: 'name',
    optionValue: 'id',
    treeProps: { children: 'children' },
    options: () => optionTree.value,
  },
  { prop: 'name', label: t('menu.menuName'), type: 'input', placeholder: t('menu.inputMenuName'), required: true },
  {
    prop: 'type',
    label: t('menu.menuType'),
    type: 'radio',
    required: true,
    options: () => [
      { label: t('menu.catalog'), value: 'C' },
      { label: t('menu.menu'), value: 'M' },
      { label: t('menu.button'), value: 'F' },
    ],
  },
  {
    prop: 'path',
    label: t('menu.routePath'),
    type: 'input',
    placeholder: '/users',
    required: true,
    hidden: (m: Record<string, unknown>) => m.type === 'F',
  },
  {
    prop: 'component',
    label: t('menu.componentPath'),
    type: 'select',
    placeholder: t('common.choose'),
    props: { filterable: true, clearable: true },
    options: () => componentOptions.map((c: string) => ({ label: c, value: c })),
    hidden: (m: Record<string, unknown>) => m.type === 'F',
  },
  {
    prop: 'permission',
    label: t('menu.permission'),
    type: 'input',
    placeholder: 'system:user:add',
    required: true,
    hidden: (m: Record<string, unknown>) => m.type !== 'F',
  },
  {
    prop: 'icon',
    label: t('menu.icon'),
    type: 'select',
    placeholder: t('menu.selectIcon'),
    props: { filterable: true, clearable: true },
    options: () => iconOptions.map((i: string) => ({ label: i, value: i })),
    hidden: (m: Record<string, unknown>) => m.type === 'F',
  },
  { prop: 'sort', label: t('common.sort'), type: 'number', props: { min: 0, max: 999 } },
  {
    prop: 'status',
    label: t('common.status'),
    type: 'switch',
    props: { activeText: t('common.enable'), inactiveText: t('common.disable') },
    activeValue: 1,
    inactiveValue: 0,
  },
  {
    prop: 'hidden',
    label: t('menu.hidden'),
    type: 'switch',
    props: { activeText: t('menu.hidden'), inactiveText: t('menu.visible') },
    activeValue: 1,
    inactiveValue: 0,
  },
])

const fetchMenus = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await menuApi.list()
    menuTree.value = res.data
  } catch (err: unknown) {
    ElMessage.error(t('menu.fetchListFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const fetchOptions = async (): Promise<void> => {
  try {
    const res = await menuApi.list()
    optionTree.value = [{ id: 0, name: t('menu.topMenu'), children: res.data }]
  } catch (err: unknown) {
    ElMessage.error(t('menu.fetchOptionsFailed') + ': ' + getErrorMessage(err))
  }
}

const openCreateDialog = (parentId?: number | null): void => {
  isEdit.value = false
  currentId.value = null
  form.parentId = parentId || null
  form.name = ''
  form.type = 'M'
  form.path = ''
  form.component = ''
  form.icon = ''
  form.permission = ''
  form.sort = 0
  form.status = 1
  form.hidden = 0
  dialogVisible.value = true
  fetchOptions()
}

const openEditDialog = (row: Record<string, unknown>): void => {
  const menuRow = row as Record<string, unknown>
  isEdit.value = true
  currentId.value = menuRow.id as number
  form.parentId = (menuRow.parentId as number) || null
  form.name = menuRow.name as string
  form.type = menuRow.type as string
  form.path = menuRow.path as string
  form.component = (menuRow.component as string) || ''
  form.icon = (menuRow.icon as string) || ''
  form.permission = (menuRow.permission as string) || ''
  form.sort = menuRow.sort as number
  form.status = menuRow.status as number
  form.hidden = menuRow.hidden as number
  dialogVisible.value = true
  fetchOptions()
}

const handleSubmit = async (): Promise<void> => {
  const valid = await proFormRef.value?.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    const payload = (proFormRef.value?.getFormData() || {}) as Record<string, unknown>
    payload.parentId = payload.parentId || 0
    if (isEdit.value) {
      if (currentId.value == null) throw new Error('Invalid ID')
      await menuApi.update(currentId.value, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await menuApi.create(payload)
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
    fetchMenus()
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err) || t('common.operationFailed'))
  } finally {
    submitLoading.value = false
  }
}

const handleDelete = async (row: Record<string, unknown>): Promise<void> => {
  try {
    const menuRow = row as Menu
    await ElMessageBox.confirm(t('menu.deleteConfirm', { name: menuRow.name }), t('common.tip'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
    await menuApi.delete(menuRow.id)
    ElMessage.success(t('messages.deleteSuccess'))
    fetchMenus()
  } catch (err: unknown) {
    if (err && err !== 'cancel') {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err) || t('messages.deleteFailed'))
    }
  }
}

onMounted(() => {
  fetchMenus()
})
</script>

<style lang="scss" scoped>
.table-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
