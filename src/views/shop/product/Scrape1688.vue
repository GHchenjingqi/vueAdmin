<template>
  <div class="page-container">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span>{{ t('shop.product.scrape1688.title') }}</span>
          <el-button :icon="Back" @click="router.push('/shop-product')">{{ t('shop.product.scrape1688.back') }}</el-button>
        </div>
      </template>

      <el-steps :active="step" align-center class="scrape-steps">
        <el-step :title="t('shop.product.scrape1688.stepInput')" />
        <el-step :title="t('shop.product.scrape1688.stepPreview')" />
        <el-step :title="t('shop.product.scrape1688.stepResult')" />
      </el-steps>

      <!-- Step 0：输入 URL -->
      <div v-show="step === 0" class="step-body">
        <el-alert type="info" :closable="false" class="mb-4">
          <template #title>{{ t('shop.product.scrape1688.tip') }}</template>
          <div class="text-sm">
            {{ t('shop.product.scrape1688.tipBody') }}
          </div>
        </el-alert>
        <el-input v-model="urlsText" type="textarea" :rows="6" :placeholder="t('shop.product.scrape1688.placeholder')" />
        <div class="flex gap-3 mt-4">
          <el-button type="primary" :disabled="!urlsText.trim()" :loading="scraping" @click="doScrape">
            {{ t('shop.product.scrape1688.scrapeBtn') }}
          </el-button>
        </div>
      </div>

      <!-- Step 1：预览抓取结果 -->
      <div v-show="step === 1" class="step-body">
        <div class="mb-4 flex flex-wrap gap-4 text-sm">
          <el-tag type="success">{{ t('shop.product.scrape1688.succeeded') }}：{{ previewData?.succeeded }}</el-tag>
          <el-tag v-if="previewData?.failed" type="danger">{{ t('shop.product.scrape1688.failed') }}：{{ previewData?.failed }}</el-tag>
        </div>

        <el-table :data="successItems" style="width: 100%" class="mb-4">
          <el-table-column :label="t('shop.product.scrape1688.colPreview')" width="100">
            <template #default="{ row }">
              <el-image :src="row.product.cover" style="width: 60px; height: 60px" fit="cover" />
            </template>
          </el-table-column>
          <el-table-column :label="t('shop.product.scrape1688.colTitle')" min-width="200">
            <template #default="{ row }">{{ row.product.title }}</template>
          </el-table-column>
          <el-table-column :label="t('shop.product.scrape1688.colImages')" width="90">
            <template #default="{ row }">{{ row.product.images.length }}</template>
          </el-table-column>
          <el-table-column :label="t('shop.product.scrape1688.colSkus')" width="80">
            <template #default="{ row }">{{ row.product.skus.length }}</template>
          </el-table-column>
          <el-table-column :label="t('shop.product.scrape1688.colCategory')" min-width="160">
            <template #default="{ row }">
              <el-select v-model="row.categoryId" :placeholder="t('shop.product.scrape1688.selectCategory')" clearable filterable style="width: 100%">
                <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </template>
          </el-table-column>
        </el-table>

        <template v-if="previewData?.failed">
          <el-collapse class="mb-4">
            <el-collapse-item :title="`${t('shop.product.scrape1688.failedItems')} (${previewData.failed})`">
              <div v-for="(item, i) in previewData.items.filter((x: any) => !x.product)" :key="i" class="text-sm text-red-500 mb-2">
                {{ item.url }} — {{ item.error }}
              </div>
            </el-collapse-item>
          </el-collapse>
        </template>

        <el-form inline class="mb-4">
          <el-form-item :label="t('shop.product.scrape1688.fxRateLabel')">
            <el-input-number v-model="fxRate" :min="0.01" :step="0.01" :precision="4" style="width: 140px" />
          </el-form-item>
          <el-form-item :label="t('shop.product.scrape1688.currencyLabel')">
            <el-select v-model="currency" style="width: 100px">
              <el-option label="CNY" value="CNY" />
              <el-option label="USD" value="USD" />
              <el-option label="EUR" value="EUR" />
            </el-select>
          </el-form-item>
        </el-form>

        <div class="flex gap-3">
          <el-button @click="step = 0">{{ t('shop.product.scrape1688.backToInput') }}</el-button>
          <el-button type="primary" :disabled="!canCommit" :loading="committing" @click="doCommit">
            {{ t('shop.product.scrape1688.commitBtn') }}
          </el-button>
        </div>
      </div>

      <!-- Step 2：结果 -->
      <div v-show="step === 2" class="step-body">
        <el-result
          icon="success"
          :title="t('shop.product.scrape1688.doneTitle')"
          :sub-title="`${t('shop.product.scrape1688.createdSpus')}：${commitResult?.createdSpus}，${t('shop.product.scrape1688.createdSkus')}：${commitResult?.createdSkus}`"
        >
          <template #extra>
            <el-button type="primary" @click="router.push('/shop-product')">{{ t('shop.product.scrape1688.gotoList') }}</el-button>
            <el-button @click="reset">{{ t('shop.product.scrape1688.scrapeMore') }}</el-button>
          </template>
        </el-result>
        <el-alert v-if="commitResult?.failed?.length" type="warning" :closable="false" class="mt-4">
          <template #title>{{ t('shop.product.scrape1688.partialFailed') }}</template>
          <div v-for="(f, i) in commitResult.failed" :key="i" class="text-sm">{{ f.skuCode }}: {{ f.message }}</div>
        </el-alert>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Back } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/i18n'
import { spuApi, categoryApi } from '@/api/shop'

const { t } = useI18n()
const router = useRouter()

const step = ref(0)
const urlsText = ref('')
const scraping = ref(false)
const committing = ref(false)
const previewData = ref<any>(null)
const commitResult = ref<any>(null)
const categories = ref<any[]>([])
const fxRate = ref(1)
const currency = ref('CNY')

const successItems = computed(() => previewData.value?.items?.filter((x: any) => x.product) ?? [])
const canCommit = computed(() => successItems.value.every((x: any) => x.categoryId))

async function loadCategories() {
  try {
    const res = await categoryApi.options()
    categories.value = res.data
  } catch {
    /* ignore */
  }
}

async function doScrape() {
  const urls = urlsText.value
    .trim()
    .split('\n')
    .map((s: string) => s.trim())
    .filter(Boolean)
  if (!urls.length) return
  scraping.value = true
  try {
    const res = await spuApi.scrape1688Preview(urls)
    previewData.value = res.data
    step.value = 1
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || t('shop.product.scrape1688.scrapeFailed'))
  } finally {
    scraping.value = false
  }
}

async function doCommit() {
  const items = successItems.value.map((x: any) => ({
    url: x.url,
    title: x.product.title,
    description: x.product.description,
    cover: x.product.cover,
    images: x.product.images,
    categoryId: x.categoryId,
    skus: x.product.skus,
  }))
  committing.value = true
  try {
    const res = await spuApi.scrape1688Commit({ items, fxRate: fxRate.value, currency: currency.value })
    commitResult.value = res.data
    step.value = 2
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || t('shop.product.scrape1688.commitFailed'))
  } finally {
    committing.value = false
  }
}

function reset() {
  step.value = 0
  urlsText.value = ''
  previewData.value = null
  commitResult.value = null
}

onMounted(loadCategories)
</script>

<style scoped>
.scrape-steps {
  margin-bottom: 24px;
}
.step-body {
  padding: 0 8px;
}
</style>
