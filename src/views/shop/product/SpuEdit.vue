<template>
  <div class="page-container spu-edit">
    <div class="page-header">
      <el-page-header @back="router.back()">
        <template #content>
          <span>{{ isEdit ? t('shop.product.edit') : t('shop.product.add') }}</span>
          <el-tag v-if="detail" :type="statusTagType(detail.spu.status)" size="small" class="status-tag">
            {{ t(`shop.status.${detail.spu.status}`) }}
          </el-tag>
        </template>
      </el-page-header>
    </div>

    <el-card v-loading="loading" shadow="never">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="140px">
        <el-form-item :label="t('shop.product.nameZh')" prop="nameZh">
          <el-input v-model="form.nameZh" maxlength="200" :placeholder="t('shop.product.nameZhPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.product.nameEn')">
          <el-input v-model="form.nameEn" maxlength="200" :placeholder="t('shop.product.nameEnPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.product.category')" prop="categoryId">
          <el-tree-select
            v-model="form.categoryId"
            :data="categoryOptions"
            :props="{ label: 'label', children: 'children' }"
            node-key="value"
            check-strictly
            :placeholder="t('shop.product.categoryPlaceholder')"
            style="width: 320px"
          />
        </el-form-item>
        <el-form-item :label="t('shop.product.brand')">
          <el-select v-model="form.brandId" clearable :placeholder="t('shop.product.brandPlaceholder')" style="width: 320px">
            <el-option v-for="opt in brandOptions" :key="opt.id" :label="opt.name" :value="opt.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('shop.product.cover')">
          <el-input v-model="form.cover" :placeholder="t('shop.product.coverPlaceholder')" style="width: 480px" />
        </el-form-item>
        <el-form-item :label="t('shop.product.images')">
          <el-input v-model="imagesText" type="textarea" :rows="2" :placeholder="t('shop.product.imagesPlaceholder')" style="width: 480px" />
        </el-form-item>
        <el-form-item :label="t('shop.product.descZh')">
          <el-input v-model="form.descZh" type="textarea" :rows="3" :placeholder="t('shop.product.descPlaceholder')" style="width: 640px" />
        </el-form-item>
        <el-form-item :label="t('shop.product.descEn')">
          <el-input v-model="form.descEn" type="textarea" :rows="3" :placeholder="t('shop.product.descPlaceholder')" style="width: 640px" />
        </el-form-item>
      </el-form>

      <div class="form-footer">
        <el-button @click="router.back()">
          {{ t('common.cancel') }}
        </el-button>
        <el-button type="primary" :loading="saveLoading" :disabled="!canEdit" @click="handleSave">
          {{ t('common.save') }}
        </el-button>
      </div>
    </el-card>

    <el-card v-if="isEdit && detail" shadow="never" class="sku-card">
      <SkuManager ref="skuManagerRef" :spu-id="detail.spu.id" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import { spuApi, categoryApi, brandApi, type SpuDetail, type ShopStatus, type CategoryTreeNode } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import SkuManager from './SkuManager.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()
const router = useRouter()
const route = useRoute()

const isEdit = computed(() => Boolean(route.query.id))
const spuId = computed(() => (route.query.id ? Number(route.query.id) : null))

const detail = ref<SpuDetail | null>(null)
const loading = ref(false)
const saveLoading = ref(false)
const formRef = ref<FormInstance | null>(null)
const skuManagerRef = ref<InstanceType<typeof SkuManager> | null>(null)

const form = reactive({
  nameZh: '',
  nameEn: '',
  categoryId: null as number | null,
  brandId: null as number | null,
  cover: '',
  descZh: '',
  descEn: '',
})
const imagesText = ref('')

/** 仅草稿/驳回态可编辑（与后端约束一致） */
const canEdit = computed(() => !isEdit.value || !detail.value || ['draft', 'rejected'].includes(detail.value.spu.status))

const rules = computed<FormRules>(() => ({
  nameZh: [{ required: true, message: t('shop.product.nameZhPlaceholder'), trigger: 'blur' }],
  categoryId: [{ required: true, message: t('shop.product.categoryPlaceholder'), trigger: 'change' }],
}))

type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'

function statusTagType(status: ShopStatus): TagType {
  const map: Record<ShopStatus, TagType> = {
    draft: 'info',
    review: 'warning',
    rejected: 'danger',
    listed: 'primary',
    published: 'success',
    unlisted: 'warning',
    archived: 'info',
  }
  return map[status]
}

// ==================== 选项 ====================
const categoryOptions = ref<Array<{ value: number; label: string; children?: unknown[] }>>([])
const brandOptions = ref<Array<{ id: number; name: string }>>([])

const fetchOptions = async (): Promise<void> => {
  try {
    const [catRes, brandRes] = await Promise.all([categoryApi.tree(), brandApi.options()])
    const toOption = (node: CategoryTreeNode): { value: number; label: string; children?: unknown[] } => ({
      value: node.id,
      label: node.name[locale.value] || node.name['zh-CN'] || `#${node.id}`,
      children: node.children?.map(toOption),
    })
    categoryOptions.value = catRes.data.map(toOption)
    brandOptions.value = brandRes.data
  } catch {
    // 选项加载失败不阻塞
  }
}

// ==================== 详情 ====================
const fetchDetail = async (): Promise<void> => {
  if (!spuId.value) return
  loading.value = true
  try {
    const res = await spuApi.detail(spuId.value)
    detail.value = res.data
    const spu = res.data.spu
    form.nameZh = spu.name['zh-CN'] || ''
    form.nameEn = spu.name['en-US'] || ''
    form.categoryId = spu.categoryId
    form.brandId = spu.brandId
    form.cover = spu.cover || ''
    form.descZh = spu.description?.['zh-CN'] || ''
    form.descEn = spu.description?.['en-US'] || ''
    imagesText.value = (spu.images || []).join('\n')
  } catch (err: unknown) {
    ElMessage.error(t('shop.product.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const handleSave = async (): Promise<void> => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  const name: Record<string, string> = { 'zh-CN': form.nameZh.trim() }
  if (form.nameEn.trim()) name['en-US'] = form.nameEn.trim()
  const description: Record<string, string> = {}
  if (form.descZh.trim()) description['zh-CN'] = form.descZh.trim()
  if (form.descEn.trim()) description['en-US'] = form.descEn.trim()
  const images = imagesText.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  const payload = {
    categoryId: form.categoryId as number,
    brandId: form.brandId,
    name,
    description: Object.keys(description).length ? description : null,
    cover: form.cover.trim() || null,
    images: images.length ? images : null,
  }

  saveLoading.value = true
  try {
    if (isEdit.value && spuId.value) {
      await spuApi.update(spuId.value, payload)
      ElMessage.success(t('common.updateSuccess'))
      await fetchDetail()
      skuManagerRef.value?.fetchSkus()
    } else {
      const res = await spuApi.create(payload)
      ElMessage.success(t('common.createSuccess'))
      router.replace(`/shop-product-edit?id=${res.data.id}`)
    }
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    saveLoading.value = false
  }
}

onMounted(() => {
  fetchOptions()
  fetchDetail()
})
</script>

<style lang="scss" scoped>
.spu-edit {
  .page-header {
    margin-bottom: 16px;

    .status-tag {
      margin-left: 12px;
    }
  }

  .form-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 8px;
  }

  .sku-card {
    margin-top: 16px;
  }
}
</style>
