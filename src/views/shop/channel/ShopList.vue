<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('shop.store.title')"
      :columns="columns"
      :data="stores"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openDialog()">
          {{ t('shop.store.add') }}
        </el-button>
      </template>

      <template #column-channel="{ row }">
        {{ channelName(row.channelId) }}
      </template>

      <template #column-status="{ row }">
        <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small" disable-transitions>
          {{ row.status === 'active' ? t('shop.store.statusActive') : t('shop.store.statusInactive') }}
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
      :title="isEdit ? t('shop.store.edit') : t('shop.store.add')"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item :label="t('shop.store.channel')" prop="channelId">
          <el-select v-model="form.channelId" :placeholder="t('shop.store.channelPlaceholder')" style="width: 100%">
            <el-option v-for="c in channelOptions" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('shop.store.name')" prop="name">
          <el-input v-model="form.name" maxlength="100" :placeholder="t('shop.store.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.store.status')" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio value="active">{{ t('shop.store.statusActive') }}</el-radio>
            <el-radio value="inactive">{{ t('shop.store.statusInactive') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('shop.store.externalShopId')">
          <el-input v-model="form.externalShopId" :placeholder="t('shop.store.externalShopIdPlaceholder')" />
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
import { channelApi, shopStoreApi, type ChannelOption, type ShopStore } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const channelOptions = ref<ChannelOption[]>([])

const channelName = (channelId: number): string => channelOptions.value.find((c) => c.id === channelId)?.name ?? String(channelId)

const columns = computed(() => [
  { prop: 'id', label: t('common.id'), width: 70 },
  { prop: 'name', label: t('shop.store.name'), minWidth: 160 },
  { prop: 'channelId', label: t('shop.store.colChannel'), minWidth: 140 },
  { prop: 'status', label: t('shop.store.status'), width: 110 },
  { prop: 'externalShopId', label: t('shop.store.externalShopId'), minWidth: 140 },
  { prop: 'createdAt', label: t('common.createdTime'), width: 175 },
  { prop: 'actions', label: t('common.operation'), width: 160, fixed: 'right' },
])

const stores = ref<ShopStore[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })
const searchParams = reactive({ keyword: '' })
const searchFields = computed(() => [{ prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('shop.store.searchPlaceholder') }])

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await shopStoreApi.list({
      page: pagination.pageNum,
      pageSize: pagination.pageSize,
    })
    stores.value = res.data.list
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('shop.store.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const loadChannelOptions = async (): Promise<void> => {
  try {
    const res = await channelApi.options()
    channelOptions.value = res.data
  } catch {
    channelOptions.value = []
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

const form = reactive<{ channelId: number | undefined; name: string; status: string; externalShopId: string }>({
  channelId: undefined,
  name: '',
  status: 'active',
  externalShopId: '',
})

const rules = computed<FormRules>(() => ({
  channelId: [{ required: true, message: t('shop.store.channelPlaceholder'), trigger: 'change' }],
  name: [{ required: true, message: t('shop.store.namePlaceholder'), trigger: 'blur' }],
}))

const openDialog = (row?: Record<string, unknown>): void => {
  if (row) {
    isEdit.value = true
    currentId.value = row.id as number
    form.channelId = row.channelId as number
    form.name = row.name as string
    form.status = (row.status as string) || 'active'
    form.externalShopId = (row.externalShopId as string) || ''
  } else {
    isEdit.value = false
    currentId.value = null
    form.channelId = undefined
    form.name = ''
    form.status = 'active'
    form.externalShopId = ''
  }
  dialogVisible.value = true
}

const handleSubmit = async (): Promise<void> => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || form.channelId == null) return

  submitLoading.value = true
  try {
    const payload = {
      channelId: form.channelId,
      name: form.name.trim(),
      status: form.status,
      externalShopId: form.externalShopId.trim() || null,
    }
    if (isEdit.value && currentId.value != null) {
      await shopStoreApi.update(currentId.value, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await shopStoreApi.create(payload)
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
  ElMessageBox.confirm(`${t('shop.store.deleteConfirm')}「${row.name}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await shopStoreApi.remove(row.id as number)
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

onMounted(() => {
  loadChannelOptions()
  fetchList()
})
</script>
