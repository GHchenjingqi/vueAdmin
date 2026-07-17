<template>
  <div class="page-container">
    <ProTable
      ref="proTableRef"
      :title="t('user.title')"
      :columns="columns"
      :search-fields="searchFields"
      :data="users"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      column-settings-key="user_list"
      :show-selection="true"
      @query="onQuery"
      @selection-change="handleSelectionChange"
    >
      <template #header-buttons>
        <el-button type="danger" :icon="Delete" :disabled="selectedIds.length === 0" @click="handleBatchDelete">
          {{ t('common.batchDelete') }}
          <template v-if="selectedIds.length">
            {{ ` (${selectedIds.length})` }}
          </template>
        </el-button>
        <el-button v-permission="['system:user:add']" type="primary" :icon="Plus" @click="handleOpenCreate">
          {{ t('user.addUser') }}
        </el-button>
        <el-button :icon="Download" @click="handleExport">
          {{ t('common.export') }}
        </el-button>
        <el-button :icon="Upload" @click="handleDownloadTemplate">
          {{ t('user.downloadTemplate') }}
        </el-button>
        <el-button type="success" :icon="Upload" @click="handleOpenImport">
          {{ t('user.import') }}
        </el-button>
      </template>

      <template #column-username="{ row }">
        <span style="font-weight: 500; color: var(--mainColor); cursor: pointer" @click="handleOpenEdit(row)">{{ row.username }}</span>
      </template>

      <template #column-nickname="{ row }">
        <span>{{ row.nickname || '-' }}</span>
      </template>

      <template #column-dept="{ row }">
        <span>{{ row.dept?.name || '-' }}</span>
      </template>

      <template #column-roles="{ row }">
        <template v-if="row.roles && row.roles.length">
          <el-tag v-for="r in row.roles" :key="r.id" size="small" style="margin-right: 4px" type="warning">
            {{ r.name }}
          </el-tag>
        </template>
        <span v-else>-</span>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
          {{ row.status === 1 ? t('user.enabled') : t('user.disabled') }}
        </el-tag>
      </template>

      <template #column-createdAt="{ row }">
        {{ row.createdAt ? new Date(row.createdAt).toLocaleString() : '-' }}
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions" style="white-space: normal; display: flex; gap: 4px; flex-wrap: wrap; align-items: center">
          <el-button type="primary" link size="small" :icon="Edit" @click="handleOpenEdit(row)">
            {{ t('common.edit') }}
          </el-button>
          <el-dropdown trigger="click" @command="(cmd) => handleActionCommand(cmd, row)">
            <el-button type="primary" link size="small">
              {{ t('user.more') }}
              <el-icon class="el-icon--right">
                <ArrowDown />
              </el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="resetPwd" :icon="Key">
                  {{ t('user.resetPwd') }}
                </el-dropdown-item>
                <el-dropdown-item command="delete" :icon="Delete" divided style="color: var(--el-color-danger)">
                  {{ t('common.delete') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </template>
    </ProTable>

    <!-- 新增/编辑用户对话框 -->
    <UserFormDialog ref="userFormDialogRef" v-model="dialogVisible" :is-edit="isEdit" :row="currentRow" @success="handleDialogSuccess" />

    <!-- 导入用户对话框 -->
    <UserImportDialog v-model="importDialogVisible" @success="fetchUsers" />
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Key, Download, Upload, ArrowDown } from '@element-plus/icons-vue'
import { userApi, deptApi, roleApi } from '@/api'
import request from '@/utils/request'
import { getErrorMessage } from '@/utils/error'
import { downloadBlob } from '@/utils/download'
import ProTable from '@/components/ProTable/index.vue'
import UserFormDialog from './user/UserFormDialog.vue'
import UserImportDialog from './user/UserImportDialog.vue'
import { useI18n } from '@/i18n'

const { t } = useI18n()

// ==================== 列定义 ====================

const columns = computed(() => [
  { prop: 'index' as const, label: t('common.index'), width: 60 },
  { prop: 'id' as const, label: t('common.id'), width: 70 },
  { prop: 'username' as const, label: t('user.username'), minWidth: 120 },
  { prop: 'nickname' as const, label: t('user.nickname'), width: 120 },
  { prop: 'dept' as const, label: t('user.dept'), width: 120 },
  { prop: 'roles' as const, label: t('user.role'), width: 180 },
  { prop: 'email' as const, label: t('common.email'), minWidth: 180 },
  { prop: 'phone' as const, label: t('common.phone'), width: 130 },
  { prop: 'status' as const, label: t('common.status'), width: 80, align: 'center' as const },
  { prop: 'createdAt' as const, label: t('common.createdTime'), width: 170 },
  { prop: 'actions' as const, label: t('common.actions'), width: 160 },
])

const searchFields = computed(() => [
  { prop: 'username', label: t('user.username'), type: 'text' as const, placeholder: t('user.inputUsername') },
  { prop: 'nickname', label: t('user.nickname'), type: 'text' as const, placeholder: t('user.inputNickname') },
  { prop: 'phone', label: t('common.phone'), type: 'text' as const, placeholder: t('user.inputPhone') },
  { prop: 'deptId', label: t('user.dept'), type: 'select' as const, placeholder: t('user.selectDept'), options: () => deptSearchOptions.value },
  { prop: 'createdAt', label: t('common.createdTime'), type: 'dateRange' as const, placeholder: t('log.selectTimeRange'), valueFormat: 'YYYY-MM-DD' },
])

// ==================== 数据 & 分页 ====================

const users = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const searchParams = reactive({
  username: '',
  nickname: '',
  phone: '',
  deptId: null as number | null,
  createdAt: null as string[] | null,
})
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })

const proTableRef = ref<InstanceType<typeof ProTable> | null>(null)
const selectedIds = ref<number[]>([])

// ==================== 选项数据 ====================

const deptSearchOptions = ref<{ label: string; value: number }[]>([])

const userFormDialogRef = ref<InstanceType<typeof UserFormDialog> | null>(null)

// ==================== 对话框状态 ====================

const dialogVisible = ref(false)
const importDialogVisible = ref(false)
const isEdit = ref(false)
const currentRow = ref<Record<string, unknown> | null>(null)

// ==================== 用户列表数据获取 ====================

async function fetchUsers(): Promise<void> {
  loading.value = true
  try {
    const params: Record<string, unknown> = {
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
      username: searchParams.username || undefined,
      nickname: searchParams.nickname || undefined,
      phone: searchParams.phone || undefined,
      deptId: searchParams.deptId || undefined,
    }
    if (searchParams.createdAt && searchParams.createdAt.length === 2) {
      params.startDate = searchParams.createdAt[0]
      params.endDate = searchParams.createdAt[1]
    }
    const res = await userApi.list(params)
    users.value = res.data.rows
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('user.fetchListFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

function onQuery({ pagination: newPagination }: { pagination: { pageNum: number; pageSize: number; total: number } }): void {
  Object.assign(pagination, newPagination)
  fetchUsers()
}

// ==================== 选中 & 批量删除 ====================

function handleSelectionChange(selection: Record<string, unknown>[]): void {
  const ids: number[] = selection.map((row) => Number(row.id))
  selectedIds.value = ids
}

async function handleBatchDelete(): Promise<void> {
  if (!selectedIds.value.length) return
  try {
    await ElMessageBox.confirm(t('user.batchDeleteCount', { count: selectedIds.value.length }), t('common.batchDelete'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
    const res = await userApi.batchDelete(selectedIds.value)
    ElMessage.success(res.message)
    selectedIds.value = []
    proTableRef.value?.clearSelection()
    fetchUsers()
  } catch (err: unknown) {
    if (err !== 'cancel') {
      ElMessage.error(t('user.batchDeleteFailed') + ': ' + getErrorMessage(err))
    }
  }
}

// ==================== 新增 / 编辑 ====================

function handleOpenCreate(): void {
  isEdit.value = false
  currentRow.value = null
  dialogVisible.value = true
}

function handleOpenEdit(row: Record<string, unknown>): void {
  isEdit.value = true
  currentRow.value = row
  dialogVisible.value = true
}

function handleDialogSuccess(): void {
  fetchUsers()
}

// ==================== 重置密码 & 删除 ====================

async function handleResetPassword(row: Record<string, unknown>): Promise<void> {
  try {
    const username = row.username as string
    const rowId = row.id as number
    await ElMessageBox.confirm(t('user.resetPwdConfirm', { username }), t('user.resetPwd'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
    const res = await userApi.changePassword(rowId, { reset: true, password: '' })
    ElMessage.success(res.message || t('user.pwdResetSuccess'))
  } catch (err: unknown) {
    if (err !== 'cancel') {
      ElMessage.error(t('user.resetPwdFailed') + ': ' + getErrorMessage(err))
    }
  }
}

async function handleDelete(row: Record<string, unknown>): Promise<void> {
  try {
    const username = row.username as string
    const rowId = row.id as number
    await ElMessageBox.confirm(t('user.deleteConfirm', { username }), t('common.tip'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
    await userApi.delete(rowId)
    ElMessage.success(t('messages.deleteSuccess'))
    fetchUsers()
  } catch (err: unknown) {
    if (err !== 'cancel') {
      ElMessage.error(t('messages.deleteFailed') + ': ' + getErrorMessage(err))
    }
  }
}

function handleActionCommand(cmd: string, row: Record<string, unknown>): void {
  if (cmd === 'resetPwd') handleResetPassword(row)
  if (cmd === 'delete') handleDelete(row)
}

// ==================== 导入 ====================

function handleOpenImport(): void {
  importDialogVisible.value = true
}

async function handleDownloadTemplate(): Promise<void> {
  try {
    const response = await userApi.downloadTemplate()
    const blobData = response.data as unknown as ArrayBuffer
    downloadBlob(new Blob([blobData]), (t('user.templateFileName') || 'user_template') + '.xlsx')
    ElMessage.success(t('user.templateDownloadSuccess'))
  } catch {
    ElMessage.error(t('user.templateDownloadFailed'))
  }
}

// ==================== 导出 ====================

async function handleExport(): Promise<void> {
  try {
    const response = await request.get<Blob>('/users/export', { responseType: 'blob' })
    downloadBlob(new Blob([response.data]), (t('user.exportFileName') || 'users_export') + '.xlsx')
    ElMessage.success(t('user.exportSuccess'))
  } catch {
    ElMessage.error(t('user.exportFailed'))
  }
}

// ==================== 初始化 ====================

async function fetchDeptOptions(): Promise<void> {
  try {
    const res = await deptApi.list()
    const tree = res.data || []

    const flattenTree = (nodes: { name: string; id: number; children?: unknown[] }[], level = 0): { label: string; value: number }[] => {
      const result: { label: string; value: number }[] = []
      for (const node of nodes) {
        result.push({ label: '\u3000'.repeat(level) + node.name, value: node.id })
        if (node.children && node.children.length) {
          const typedNodes: { name: string; id: number; children?: unknown[] }[] = node.children as typeof nodes
          result.push(...flattenTree(typedNodes, level + 1))
        }
      }
      return result
    }

    const options = flattenTree(tree)
    deptSearchOptions.value = options

    // 同步到 UserFormDialog 的部门选项
    userFormDialogRef.value?.setDeptOptions(options)
  } catch {
    // 部门选项加载失败不影响主流程
  }
}

async function fetchRoleOptions(): Promise<void> {
  try {
    const res = await roleApi.list({ scope: 'all' })
    const options = (res.data?.rows || []).map((r: { name: string; id: number }) => ({ label: r.name, value: r.id }))
    userFormDialogRef.value?.setRoleOptions(options)
  } catch {
    // 角色选项加载失败不影响主流程
  }
}

onMounted(() => {
  fetchUsers()
  fetchDeptOptions()
  fetchRoleOptions()
})
</script>

<style lang="scss" scoped>
.table-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
