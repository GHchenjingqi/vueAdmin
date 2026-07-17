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
        <el-button type="primary" :icon="Plus" @click="handleOpenCreate">
          {{ t('user.addUser') }}
        </el-button>
      </template>

      <template #column-username="{ row }">
        <span style="font-weight: 500; color: var(--mainColor); cursor: pointer" @click="handleOpenEdit(row)">{{ row.username }}</span>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
          {{ row.status === 1 ? t('user.enabled') : t('user.disabled') }}
        </el-tag>
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="primary" link size="small" :icon="Edit" @click="handleOpenEdit(row)">
            {{ t('common.edit') }}
          </el-button>
          <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row)">
            {{ t('common.delete') }}
          </el-button>
        </div>
      </template>
    </ProTable>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import ProTable from '@/components/ProTable/index.vue'
import { userApi } from '@/api/user'

const { t } = useI18n()
const proTableRef = ref()
const users = ref<User[]>([])
const loading = ref(false)

const searchParams = reactive({
  username: '',
  phone: '',
  deptId: undefined as number | undefined,
})

const pagination = reactive({ page: 1, pageSize: 10, total: 0 })

const columns = computed(() => [
  { prop: 'id', label: 'ID', width: 80 },
  { prop: 'username', label: t('user.username'), slot: 'column-username', minWidth: 120 },
  { prop: 'nickname', label: t('user.nickname'), minWidth: 120 },
  { prop: 'email', label: t('user.email'), minWidth: 180 },
  { prop: 'phone', label: t('user.phone'), minWidth: 130 },
  { prop: 'status', label: t('user.status'), slot: 'column-status', width: 100 },
  { prop: 'actions', label: t('common.actions'), slot: 'column-actions', width: 160, fixed: 'right' as const },
])

const searchFields = computed(() => [
  { prop: 'username', label: t('user.username'), type: 'input' },
  { prop: 'phone', label: t('user.phone'), type: 'input' },
])

async function fetchData() {
  loading.value = true
  try {
    const res = await userApi.list({ ...searchParams, page: pagination.page, pageSize: pagination.pageSize })
    users.value = res.data.list
    pagination.total = res.data.total
  } finally {
    loading.value = false
  }
}

const onQuery = async (params: any) => {
  Object.assign(searchParams, params)
  pagination.page = 1
  await fetchData()
}

onMounted(() => { fetchData() })
</script>