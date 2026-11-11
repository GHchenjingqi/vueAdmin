<template>
  <div class="page-container">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true">
        <el-form-item :label="t('shop.channelProducts.channelId')">
          <el-input-number v-model="query.channelId" :min="1" :controls="false" style="width: 130px" />
        </el-form-item>
        <el-form-item :label="t('shop.channelProducts.shopId')">
          <el-input-number v-model="query.shopId" :min="1" :controls="false" style="width: 130px" />
        </el-form-item>
        <el-form-item :label="t('shop.channelProducts.spuId')">
          <el-input-number v-model="query.spuId" :min="1" :controls="false" style="width: 130px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="handleSearch">{{ t('common.search') }}</el-button>
          <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
          <el-button type="success" @click="openPublish">{{ t('shop.channelProducts.publish') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="rows" border stripe>
        <el-table-column prop="id" :label="t('common.id')" width="80" />
        <el-table-column prop="channelId" :label="t('shop.channelProducts.channelId')" width="120" />
        <el-table-column prop="shopId" :label="t('shop.channelProducts.shopId')" width="110" />
        <el-table-column prop="spuId" :label="t('shop.channelProducts.spuId')" width="110" />
        <el-table-column prop="skuId" :label="t('shop.channelProducts.skuId')" width="110" />
        <el-table-column prop="externalId" :label="t('shop.channelProducts.externalId')" min-width="160" />
        <el-table-column :label="t('common.status')" width="120">
          <template #default="{ row }">
            <el-tag :type="(row as ChannelProductItem).status === 'published' ? 'success' : 'info'" size="small" disable-transitions>
              {{ (row as ChannelProductItem).status === 'published' ? t('shop.channelProducts.statusPublished') : t('shop.channelProducts.statusListed') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" :label="t('common.createdTime')" min-width="170" />
      </el-table>
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        class="pager"
        layout="total, prev, pager, next"
        :total="pagination.total"
        @current-change="load"
      />
    </el-card>

    <el-dialog v-model="dialogVisible" :title="t('shop.channelProducts.publishTitle')" width="520px" destroy-on-close>
      <el-form :model="form" label-width="150px">
        <el-form-item :label="t('shop.channelProducts.spuId')" required>
          <el-input-number v-model="form.spuId" :min="1" :controls="false" />
        </el-form-item>
        <el-form-item :label="t('shop.channelProducts.channelId')" required>
          <el-input-number v-model="form.channelId" :min="1" :controls="false" />
        </el-form-item>
        <el-form-item :label="t('shop.channelProducts.shopId')" required>
          <el-input-number v-model="form.shopId" :min="1" :controls="false" />
        </el-form-item>
        <el-form-item :label="t('shop.channelProducts.skuId')">
          <el-input-number v-model="form.skuId" :min="1" :controls="false" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handlePublish">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { shopChannelProductApi, type ChannelProductItem } from '@/api/shopChannelProduct'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const rows = ref<ChannelProductItem[]>([])
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const query = reactive<{ channelId: number | undefined; shopId: number | undefined; spuId: number | undefined }>({
  channelId: undefined,
  shopId: undefined,
  spuId: undefined,
})
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({ spuId: 0, channelId: 0, shopId: 0, skuId: 0 })

const load = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await shopChannelProductApi.list({
      channelId: query.channelId,
      shopId: query.shopId,
      spuId: query.spuId,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
    rows.value = res.data.list
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('shop.channelProducts.loadFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const handleSearch = (): void => {
  pagination.page = 1
  load()
}

const handleReset = (): void => {
  query.channelId = undefined
  query.shopId = undefined
  query.spuId = undefined
  pagination.page = 1
  load()
}

const openPublish = (): void => {
  form.spuId = 0
  form.channelId = 0
  form.shopId = 0
  form.skuId = 0
  dialogVisible.value = true
}

const handlePublish = async (): Promise<void> => {
  if (!form.spuId || !form.channelId || !form.shopId) {
    ElMessage.warning(t('shop.channelProducts.required'))
    return
  }
  submitting.value = true
  try {
    await shopChannelProductApi.publish({
      spuId: form.spuId,
      channelId: form.channelId,
      shopId: form.shopId,
      skuId: form.skuId || null,
    })
    ElMessage.success(t('shop.channelProducts.publishSuccess'))
    dialogVisible.value = false
    await load()
  } catch (err: unknown) {
    ElMessage.error(t('shop.channelProducts.loadFailed') + ': ' + getErrorMessage(err))
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<style scoped lang="scss">
.filter-card {
  margin-bottom: 16px;
}

.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
