<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('shop.publish.title')"
    width="480px"
    :close-on-click-modal="false"
    destroy-on-close
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <el-form label-width="100px">
      <el-form-item :label="t('shop.publish.selectChannel')">
        <el-select v-model="form.channelId" :placeholder="t('shop.publish.selectChannel')" style="width: 100%" @change="handleChannelChange">
          <el-option v-for="c in channelOptions" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <div v-if="!channelOptions.length" class="form-tip">{{ t('shop.publish.noChannel') }}</div>
      </el-form-item>
      <el-form-item :label="t('shop.publish.selectShop')">
        <el-select v-model="form.shopId" :placeholder="t('shop.publish.selectShop')" style="width: 100%" :disabled="!form.channelId">
          <el-option v-for="s in shopOptions" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">
        {{ t('common.cancel') }}
      </el-button>
      <el-button type="primary" :loading="loading" @click="handlePublish">
        {{ t('shop.publish.publish') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { channelApi, channelProductApi, shopStoreApi, type ChannelOption, type ShopOption } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const props = defineProps<{
  modelValue: boolean
  spuId: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  published: []
}>()

const { t } = useI18n()

const channelOptions = ref<ChannelOption[]>([])
const shopOptions = ref<ShopOption[]>([])
const loading = ref(false)

const form = reactive<{ channelId: number | undefined; shopId: number | undefined }>({
  channelId: undefined,
  shopId: undefined,
})

const loadChannelOptions = async (): Promise<void> => {
  try {
    const res = await channelApi.options()
    channelOptions.value = res.data
  } catch {
    channelOptions.value = []
  }
}

const loadShopOptions = async (channelId: number): Promise<void> => {
  try {
    const res = await shopStoreApi.options({ channelId })
    shopOptions.value = res.data
  } catch {
    shopOptions.value = []
  }
}

const handleChannelChange = async (channelId: number | undefined): Promise<void> => {
  form.shopId = undefined
  shopOptions.value = []
  if (channelId != null) await loadShopOptions(channelId)
}

const handlePublish = async (): Promise<void> => {
  if (props.spuId == null) return
  if (form.channelId == null) {
    ElMessage.warning(t('shop.publish.selectChannel'))
    return
  }
  if (form.shopId == null) {
    ElMessage.warning(t('shop.publish.selectShop'))
    return
  }

  loading.value = true
  try {
    await channelProductApi.publish({
      channelId: form.channelId,
      shopId: form.shopId,
      spuId: props.spuId,
    })
    ElMessage.success(t('shop.publish.published'))
    emit('update:modelValue', false)
    emit('published')
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return
    form.channelId = undefined
    form.shopId = undefined
    shopOptions.value = []
    await loadChannelOptions()
  },
  { immediate: true },
)
</script>

<style lang="scss" scoped>
.form-tip {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
