<template>
  <div class="page-container">
    <ProTable
      ref="proTableRef"
      :title="t('message.title')"
      :columns="columns"
      :data="messages"
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
        <el-button type="primary" :icon="EditPen" v-permission="['sys:msg:send']" @click="handleCreate">
          {{ t('message.sendMessage') }}
        </el-button>
        <el-button :icon="Select" @click="handleReadAll">
          {{ t('message.readAll') }}
        </el-button>
      </template>

      <template #column-type="{ row }">
        <el-tag :type="typeTag(row.type)" size="small">
          {{ typeLabel(row.type) }}
        </el-tag>
      </template>

      <template #column-isRead="{ row }">
        <el-tag :type="row.isRead ? 'success' : 'warning'" size="small">
          {{ row.isRead ? t('message.read') : t('message.unread') }}
        </el-tag>
      </template>

      <template #column-title="{ row }">
        <span :style="{ fontWeight: row.isRead ? 'normal' : 'bold' }">{{ row.title }}</span>
      </template>

      <template #column-fromUser="{ row }">
        <span v-if="row.fromUser">{{ row.fromUser.nickname || row.fromUser.username }}</span>
        <el-tag v-else type="info" size="small">
          {{ t('message.system') }}
        </el-tag>
      </template>

      <template #column-createdAt="{ row }">
        {{ formatTime(row.createdAt) }}
      </template>

      <template #column-actions="{ row }">
        <el-button type="primary" link size="small" @click="handleView(row)">
          {{ t('common.view') }}
        </el-button>
        <el-button type="danger" link size="small" @click="handleDelete(row)">
          {{ t('common.delete') }}
        </el-button>
      </template>
    </ProTable>

    <el-dialog v-model="dialogVisible" :title="isView ? t('message.messageDetail') : t('message.sendMessage')" width="600px" destroy-on-close>
      <template v-if="isView">
        <el-descriptions :column="1" border>
          <el-descriptions-item :label="t('message.content')">
            {{ currentMessage.title }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('common.type')">
            <el-tag :type="typeTag(currentMessage.type)" size="small">
              {{ typeLabel(currentMessage.type) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="t('message.sender')">
            <span v-if="currentMessage.fromUser">{{ currentMessage.fromUser.nickname || currentMessage.fromUser.username }}</span>
            <el-tag v-else type="info" size="small">
              {{ t('message.system') }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item :label="t('message.time')">
            {{ formatTime(currentMessage.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('message.content')">
            <div style="white-space: pre-wrap; line-height: 1.8">
              {{ currentMessage.content }}
            </div>
          </el-descriptions-item>
        </el-descriptions>
      </template>
      <template v-else>
        <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
          <el-form-item :label="t('message.messageType')" prop="type">
            <el-radio-group v-model="form.type">
              <el-radio value="notice">
                {{ t('message.announcement') }}
              </el-radio>
              <el-radio value="system">
                {{ t('message.systemMessage') }}
              </el-radio>
              <el-radio value="private">
                {{ t('message.privateMessage') }}
              </el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="form.type === 'private'" :label="t('message.recipient')" prop="toUserId">
            <el-select v-model="form.toUserId" :placeholder="t('message.selectRecipient')" filterable clearable style="width: 100%">
              <el-option v-for="user in userList" :key="user.id" :label="`${user.nickname || user.username} (${user.username})`" :value="user.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('notice.title')" prop="title">
            <el-input v-model="form.title" :placeholder="t('message.inputTitle')" />
          </el-form-item>
          <el-form-item :label="t('message.content')" prop="content">
            <el-input v-model="form.content" type="textarea" :rows="5" :placeholder="t('message.inputContent')" />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button v-if="isView" @click="dialogVisible = false">
          {{ t('common.close') }}
        </el-button>
        <template v-else>
          <el-button @click="dialogVisible = false">
            {{ t('common.cancel') }}
          </el-button>
          <el-button type="primary" :loading="submitting" @click="handleSubmit">
            {{ t('message.send') }}
          </el-button>
        </template>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { EditPen, Select } from '@element-plus/icons-vue'
import ProTable from '@/components/ProTable/index.vue'
import request from '@/utils/request'
import { useI18n } from '@/i18n'

const { t } = useI18n()

interface MessageUser {
  id: number
  username: string
  nickname?: string
}

interface MessageRecord {
  id: number
  title: string
  type: string
  content: string
  isRead: boolean
  fromUser?: MessageUser | null
  createdAt: string
  [key: string]: unknown
}

interface SendForm {
  type: string
  toUserId: number | null
  title: string
  content: string
}

const dialogVisible = ref(false)
const isView = ref(false)
const submitting = ref(false)
const formRef = ref()
const currentMessage = ref<MessageRecord>({} as MessageRecord)
const userList = ref<MessageUser[]>([])
const messages = ref<MessageRecord[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })

const searchFields = computed(() => [
  {
    prop: 'type',
    label: t('common.type'),
    type: 'select',
    placeholder: t('message.allTypes'),
    options: [
      { label: t('message.systemMessage'), value: 'system' },
      { label: t('message.announcement'), value: 'notice' },
      { label: t('message.privateMessage'), value: 'private' },
    ],
  },
  {
    prop: 'isRead',
    label: t('common.status'),
    type: 'select',
    placeholder: t('common.all'),
    options: [
      { label: t('message.read'), value: '1' },
      { label: t('message.unread'), value: '0' },
    ],
  },
])

const searchParams = reactive({
  type: '',
  isRead: '',
})

let form = reactive<SendForm>({
  type: 'notice',
  toUserId: null,
  title: '',
  content: '',
})

const rules = {
  title: [{ required: true, message: t('message.inputTitle'), trigger: 'blur' }],
  content: [{ required: true, message: t('message.inputContent'), trigger: 'blur' }],
}

const columns = computed(() => [
  { prop: 'id', label: 'ID', width: 70 },
  { prop: 'type', label: t('common.type'), width: 100 },
  { prop: 'title', label: t('notice.title'), minWidth: 200 },
  { prop: 'fromUser', label: t('message.sender'), width: 120 },
  { prop: 'isRead', label: t('common.status'), width: 80 },
  { prop: 'createdAt', label: t('message.time'), width: 170 },
  { prop: 'actions', label: t('common.actions'), width: 150, fixed: 'right' },
])

const typeTagMap: Record<string, string> = { system: 'info', notice: 'warning', private: 'success' }
const typeLabelMap: Record<string, string> = { system: t('message.systemMessage'), notice: t('message.announcement'), private: t('message.privateMessage') }

function typeTag(type: string): 'success' | 'warning' | 'info' | 'primary' | 'danger' | undefined {
  return (typeTagMap[type] as 'success' | 'warning' | 'info' | 'primary' | 'danger') || undefined
}

function typeLabel(type: string): string {
  return typeLabelMap[type] || type
}

function formatTime(time: string | number | Date): string {
  if (!time) return ''
  return new Date(time).toLocaleString()
}

function onQuery(): void {
  fetchMessages()
}

async function fetchMessages(): Promise<void> {
  loading.value = true
  try {
    const params: Record<string, unknown> = { page: pagination.pageNum, pageSize: pagination.pageSize }
    if (searchParams.type) params.type = searchParams.type
    if (searchParams.isRead !== '') params.isRead = searchParams.isRead
    const res = await request.get<{ rows: MessageRecord[]; total: number }>('/messages', { params })
    messages.value = res.data.rows || []
    pagination.total = res.data.total || 0
  } catch {
    // 消息列表获取失败，使用空列表
    messages.value = []
  } finally {
    loading.value = false
  }
}

async function handleCreate(): Promise<void> {
  isView.value = false
  form.type = 'notice'
  form.toUserId = null
  form.title = ''
  form.content = ''
  try {
    const res = await request.get<{ rows: MessageUser[] }>('/users', { params: { page: 1, pageSize: 999 } })
    userList.value = res.data.rows || []
  } catch {
    // 用户列表获取失败，不影响发送消息弹窗打开
  }
  dialogVisible.value = true
}

async function handleView(row: Record<string, unknown>): Promise<void> {
  isView.value = true
  const msg = row as MessageRecord
  currentMessage.value = msg
  if (!msg.isRead) {
    try {
      await request.patch(`/messages/${msg.id}`, { isRead: true })
      msg.isRead = true
      fetchMessages()
    } catch {
      // 标记已读失败，不影响查看消息
    }
  }
  dialogVisible.value = true
}

async function handleSubmit(): Promise<void> {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await request.post('/messages', { ...form })
    ElMessage.success(t('message.sendSuccess'))
    dialogVisible.value = false
    fetchMessages()
  } catch {
    // 发送消息失败，错误已由拦截器提示
  } finally {
    submitting.value = false
  }
}

async function handleReadAll(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('message.readAllConfirm'), t('common.tip'))
    await request.patch('/messages', { readAll: true })
    ElMessage.success(t('message.readAllSuccess'))
    fetchMessages()
  } catch {
    // 用户取消全部已读
  }
}

async function handleDelete(row: Record<string, unknown>): Promise<void> {
  try {
    const messageId = (row as MessageRecord).id
    await ElMessageBox.confirm(t('message.deleteConfirm'), t('common.tip'), { type: 'warning' })
    await request.delete(`/messages/${messageId}`)
    ElMessage.success(t('message.deleteSuccess'))
    fetchMessages()
  } catch {
    // 用户取消删除
  }
}

onMounted(fetchMessages)
</script>
