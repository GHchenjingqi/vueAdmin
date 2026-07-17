<template>
  <div class="page-container">
    <ProTable
      ref="proTableRef"
      :title="t('onlineUsers.title')"
      :columns="columns"
      :data="filteredUsers"
      :loading="loading"
      :search-fields="searchFields"
      :search-params="searchParams"
      :pagination="pagination"
      :show-index="false"
      :show-selection="false"
      :show-pagination="false"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-tag type="success" size="large">{{ t('onlineUsers.currentlyOnline') }}: {{ onlineCount }}</el-tag>
        <el-button :icon="Refresh" :loading="loading" @click="fetchData">
          {{ t('common.refresh') }}
        </el-button>
      </template>

      <template #column-actions="{ row }">
        <el-button type="danger" link size="small" @click="handleKick(row)">
          {{ t('onlineUsers.forceOffline') }}
        </el-button>
      </template>
    </ProTable>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import request from '@/utils/request'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t } = useI18n()

interface OnlineUserRecord {
  userId: number
  username: string
  nickname: string
  ip: string
  loginTime: string
  lastActiveTime: string
  [key: string]: unknown
}

const searchFields = computed(() => [
  { prop: 'username', label: t('onlineUsers.username'), type: 'input', placeholder: t('onlineUsers.inputUsername') },
  { prop: 'nickname', label: t('onlineUsers.nickname'), type: 'input', placeholder: t('onlineUsers.inputNickname') },
  { prop: 'ip', label: t('onlineUsers.ipAddress'), type: 'input', placeholder: t('onlineUsers.inputIp') },
])

const columns = computed(() => [
  { prop: 'userId', label: t('onlineUsers.userId'), width: 80 },
  { prop: 'username', label: t('onlineUsers.username'), width: 130 },
  { prop: 'nickname', label: t('onlineUsers.nickname'), width: 130 },
  { prop: 'ip', label: t('onlineUsers.ipAddress'), minWidth: 160 },
  {
    prop: 'loginTime',
    label: t('onlineUsers.loginTime'),
    width: 180,
    formatter: (row: Record<string, unknown>) => {
      const loginTime = row.loginTime as string
      return formatTime(loginTime)
    },
  },
  {
    prop: 'lastActiveTime',
    label: t('onlineUsers.lastActive'),
    width: 180,
    formatter: (row: Record<string, unknown>) => {
      const lastActive = row.lastActiveTime as string
      return formatTime(lastActive)
    },
  },
  { prop: 'actions', label: t('common.operation'), width: 120, fixed: 'right', align: 'center' },
])

const loading = ref(false)
const allUsers = ref<OnlineUserRecord[]>([])
const onlineCount = ref(0)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })

const searchParams = reactive({
  username: '',
  nickname: '',
  ip: '',
})

const filteredUsers = computed(() => {
  return allUsers.value.filter((user: OnlineUserRecord) => {
    if (searchParams.username && !(user.username || '').toLowerCase().includes(searchParams.username.toLowerCase())) {
      return false
    }
    if (searchParams.nickname && !(user.nickname || '').toLowerCase().includes(searchParams.nickname.toLowerCase())) {
      return false
    }
    if (searchParams.ip && !(user.ip || '').toLowerCase().includes(searchParams.ip.toLowerCase())) {
      return false
    }
    return true
  })
})

function formatTime(time: string | undefined | null): string {
  if (!time) return ''
  return new Date(time).toLocaleString()
}

function onQuery(): void {
  // computed 会自动过滤，无需额外逻辑
}

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const res = await request.get<{ users: OnlineUserRecord[]; total: number }>('/online-users')
    allUsers.value = res.data.users || []
    onlineCount.value = res.data.total || 0
    pagination.total = allUsers.value.length
  } catch {
    // 在线用户列表获取失败，使用空列表
  } finally {
    loading.value = false
  }
}

async function handleKick(row: Record<string, unknown>): Promise<void> {
  const username = row.username as string
  try {
    await ElMessageBox.confirm(`${t('onlineUsers.kickConfirm')}「${username}」？`, t('common.tip'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
    await request.post('/online-users/kick', { userId: row.userId })
    ElMessage.success(t('onlineUsers.kicked'))
    fetchData()
  } catch {
    // 用户取消踢出或踢出操作失败
  }
}

onMounted(fetchData)
</script>
