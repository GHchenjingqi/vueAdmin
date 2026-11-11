<template>
  <div class="page-container">
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true">
        <el-form-item :label="t('common.status')">
          <el-select v-model="query.status" clearable style="width: 140px" :placeholder="t('common.all')">
            <el-option :label="t('shop.articles.statusDraft')" value="draft" />
            <el-option :label="t('shop.articles.statusPublished')" value="published" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('shop.articles.siteId')">
          <el-input-number v-model="query.siteId" :min="0" :controls="false" style="width: 120px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="handleSearch">{{ t('common.search') }}</el-button>
          <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
          <el-button type="success" @click="openCreate">{{ t('shop.articles.create') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="rows" border stripe>
        <el-table-column prop="id" :label="t('common.id')" width="80" />
        <el-table-column prop="title" :label="t('shop.articles.title')" min-width="200" show-overflow-tooltip />
        <el-table-column prop="slug" label="Slug" min-width="180" show-overflow-tooltip />
        <el-table-column :label="t('common.status')" width="110">
          <template #default="{ row }">
            <el-tag :type="(row as ArticleItem).status === 'published' ? 'success' : 'info'" size="small" disable-transitions>
              {{ (row as ArticleItem).status === 'published' ? t('shop.articles.statusPublished') : t('shop.articles.statusDraft') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sortOrder" :label="t('shop.articles.sortOrder')" width="100" />
        <el-table-column prop="publishedAt" :label="t('shop.articles.publishedAt')" min-width="160" />
        <el-table-column :label="t('common.operation')" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="openEdit(row as ArticleItem)">{{ t('common.edit') }}</el-button>
            <el-button v-if="(row as ArticleItem).status === 'draft'" type="success" link :loading="submitting" @click="handlePublish(row as ArticleItem)">
              {{ t('shop.articles.publish') }}
            </el-button>
            <el-button v-else type="warning" link :loading="submitting" @click="handleUnpublish(row as ArticleItem)">
              {{ t('shop.articles.unpublish') }}
            </el-button>
          </template>
        </el-table-column>
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

    <el-dialog v-model="dialogVisible" :title="editingId ? t('shop.articles.edit') : t('shop.articles.create')" width="720px" destroy-on-close>
      <el-form :model="form" label-width="110px">
        <el-form-item :label="t('shop.articles.title')" required>
          <el-input v-model="form.title" maxlength="255" />
        </el-form-item>
        <el-form-item label="Slug" required>
          <el-input v-model="form.slug" :placeholder="t('shop.articles.slugHint')" />
        </el-form-item>
        <el-form-item :label="t('shop.articles.summary')">
          <el-input v-model="form.summary" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
        <el-form-item :label="t('shop.articles.content')" required>
          <el-input v-model="form.content" type="textarea" :rows="7" />
        </el-form-item>
        <el-form-item :label="t('shop.articles.authorName')">
          <el-input v-model="form.authorName" maxlength="120" />
        </el-form-item>
        <el-form-item :label="t('shop.articles.coverImage')">
          <el-input v-model="form.coverImage" maxlength="512" />
        </el-form-item>
        <el-form-item :label="t('shop.articles.tags')">
          <el-input v-model="tagsText" :placeholder="t('shop.articles.tagsPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.articles.sortOrder')">
          <el-input-number v-model="form.sortOrder" :min="0" :max="99999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSave">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { shopArticleApi, type ArticleItem, type ArticleStatus } from '@/api/shopArticle'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const rows = ref<ArticleItem[]>([])
const loading = ref(false)
const submitting = ref(false)
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const tagsText = ref('')
const query = reactive<{ status: ArticleStatus | ''; siteId: number }>({ status: '', siteId: 0 })
const pagination = reactive({ page: 1, pageSize: 20, total: 0 })
const form = reactive({
  title: '',
  slug: '',
  summary: '',
  content: '',
  authorName: '',
  coverImage: '',
  sortOrder: 0,
})

const buildPayload = () => ({
  title: form.title.trim(),
  slug: form.slug.trim(),
  summary: form.summary.trim() || null,
  content: form.content,
  authorName: form.authorName.trim() || null,
  coverImage: form.coverImage.trim() || null,
  tags: tagsText.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  sortOrder: form.sortOrder,
})

const load = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await shopArticleApi.list({
      status: query.status || undefined,
      siteId: query.siteId || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
    rows.value = res.data.rows
    pagination.total = res.data.total
  } catch (err: unknown) {
    ElMessage.error(t('shop.articles.loadFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const handleSearch = (): void => {
  pagination.page = 1
  load()
}

const handleReset = (): void => {
  query.status = ''
  query.siteId = 0
  pagination.page = 1
  load()
}

const resetForm = (): void => {
  form.title = ''
  form.slug = ''
  form.summary = ''
  form.content = ''
  form.authorName = ''
  form.coverImage = ''
  form.sortOrder = 0
  tagsText.value = ''
}

const openCreate = (): void => {
  editingId.value = null
  resetForm()
  dialogVisible.value = true
}

const openEdit = async (row: ArticleItem): Promise<void> => {
  editingId.value = row.id
  resetForm()
  form.title = row.title
  form.slug = row.slug
  form.sortOrder = row.sortOrder
  dialogVisible.value = true
  try {
    const res = await shopArticleApi.detail(row.id)
    const d = res.data
    form.title = d.title
    form.slug = d.slug
    form.summary = d.summary ?? ''
    form.content = d.content ?? ''
    form.authorName = d.authorName ?? ''
    form.coverImage = d.coverImage ?? ''
    form.sortOrder = d.sortOrder ?? 0
    tagsText.value = (d.tags ?? []).join(',')
  } catch (err: unknown) {
    ElMessage.error(t('shop.articles.loadFailed') + ': ' + getErrorMessage(err))
  }
}

const handleSave = async (): Promise<void> => {
  if (!form.title.trim() || !form.slug.trim() || !form.content.trim()) {
    ElMessage.warning(t('shop.articles.required'))
    return
  }
  submitting.value = true
  try {
    const payload = buildPayload()
    if (editingId.value) await shopArticleApi.update(editingId.value, payload)
    else await shopArticleApi.create({ ...payload, status: 'draft' })
    ElMessage.success(t('shop.articles.saveSuccess'))
    dialogVisible.value = false
    await load()
  } catch (err: unknown) {
    ElMessage.error(t('shop.articles.loadFailed') + ': ' + getErrorMessage(err))
  } finally {
    submitting.value = false
  }
}

const handlePublish = async (row: ArticleItem): Promise<void> => {
  submitting.value = true
  try {
    await shopArticleApi.publish(row.id)
    ElMessage.success(t('shop.articles.saveSuccess'))
    await load()
  } catch (err: unknown) {
    ElMessage.error(t('shop.articles.loadFailed') + ': ' + getErrorMessage(err))
  } finally {
    submitting.value = false
  }
}

const handleUnpublish = async (row: ArticleItem): Promise<void> => {
  submitting.value = true
  try {
    await shopArticleApi.unpublish(row.id)
    ElMessage.success(t('shop.articles.saveSuccess'))
    await load()
  } catch (err: unknown) {
    ElMessage.error(t('shop.articles.loadFailed') + ': ' + getErrorMessage(err))
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
