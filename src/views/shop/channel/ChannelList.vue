<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('shop.channel.title')"
      :columns="columns"
      :data="channels"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openDialog()">
          {{ t('shop.channel.add') }}
        </el-button>
      </template>

      <template #column-type="{ row }">
        <el-tag size="small" disable-transitions>{{ channelTypeLabel(row.type) }}</el-tag>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small" disable-transitions>
          {{ row.status === 'active' ? t('shop.channel.statusActive') : t('shop.channel.statusInactive') }}
        </el-tag>
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="warning" link size="small" :icon="Edit" @click="openDialog(row)">
            {{ t('common.edit') }}
          </el-button>
          <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row)">
            {{ t('common.delete') }}
          </el-button>
        </div>
      </template>
    </ProTable>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? t('shop.channel.edit') : t('shop.channel.add')"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item :label="t('shop.channel.name')" prop="name">
          <el-input v-model="form.name" maxlength="100" :placeholder="t('shop.channel.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.channel.type')" prop="type">
          <el-select v-model="form.type" style="width: 100%">
            <el-option v-for="opt in channelTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('shop.channel.status')" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio value="active">{{ t('shop.channel.statusActive') }}</el-radio>
            <el-radio value="inactive">{{ t('shop.channel.statusInactive') }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
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
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { channelApi, type Channel, type ChannelType } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const channelTypeOptions = computed(() => [
  { value: 'amazon' as ChannelType, label: t('shop.channel.typeAmazon') },
  { value: 'shopify' as ChannelType, label: t('shop.channel.typeShopify') },
  { value: 'tiktok' as ChannelType, label: t('shop.channel.typeTiktok') },
  { value: 'shopee' as ChannelType, label: t('shop.channel.typeShopee') },
  { value: 'independent' as ChannelType, label: t('shop.channel.typeIndependent') },
])

const channelTypeLabel = (type: string): string => channelTypeOptions.value.find((o) => o.value === type)?.label ?? type

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'name', label: t('shop.channel.name'), minWidth: 160 },
  { prop: 'type', label: t('shop.channel.colType'), width: 140 },
  { prop: 'status', label: t('shop.channel.status'), width: 100 },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 160, fixed: 'right' },
])

const channels = ref<Channel[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive({ keyword: '' })
const searchFields = computed(() => [{ prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('shop.channel.searchPlaceholder') }])

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await channelApi.list({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
    })
    channels.value = res.data.list
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('shop.channel.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const onQuery = ({ pagination: p, searchParams: s }: { pagination: Record<string, number>; searchParams?: Record<string, unknown> }): void => {
  Object.assign(pagination, p)
  if (s) Object.assign(searchParams, s)
  fetchList()
}

// ==================== 弹窗 ====================
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref<FormInstance | null>(null)
const currentId = ref<number | null>(null)

const form = reactive<{ name: string; type: ChannelType; status: string }>({
  name: '',
  type: 'amazon',
  status: 'active',
})

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: t('shop.channel.namePlaceholder'), trigger: 'blur' }],
  type: [{ required: true, message: t('shop.channel.type'), trigger: 'change' }],
}))

const openDialog = (row?: Record<string, unknown>): void => {
  if (row) {
    isEdit.value = true
    currentId.value = row.id as number
    form.name = row.name as string
    form.type = (row.type as ChannelType) || 'amazon'
    form.status = (row.status as string) || 'active'
  } else {
    isEdit.value = false
    currentId.value = null
    form.name = ''
    form.type = 'amazon'
    form.status = 'active'
  }
  dialogVisible.value = true
}

const handleSubmit = async (): Promise<void> => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    const payload = { name: form.name.trim(), type: form.type, status: form.status }
    if (isEdit.value && currentId.value != null) {
      await channelApi.update(currentId.value, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await channelApi.create(payload)
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
    fetchList()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitLoading.value = false
  }
}

const handleDelete = (row: Record<string, unknown>): void => {
  ElMessageBox.confirm(`${t('shop.channel.deleteConfirm')}「${row.name}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await channelApi.remove(row.id as number)
        ElMessage.success(t('messages.deleteSuccess'))
        fetchList()
      } catch (err: unknown) {
        ElMessage.error(getErrorMessage(err))
      }
    })
    .catch(() => {
      // 用户取消
    })
}

onMounted(fetchList)
</script>
