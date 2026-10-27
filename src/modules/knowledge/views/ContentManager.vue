<template>
  <div class="page-container">
    <ProTable
      :title="t('knowledge.content')"
      :columns="columns"
      :data="list"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      column-settings-key="knowledge_content_list"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openCreate()">
          {{ t('knowledge.addContent') }}
        </el-button>
      </template>

      <template #column-status="{ row }">
        <el-tag :type="row.status === 'published' ? 'success' : 'info'" size="small">
          {{ row.status === 'published' ? t('knowledge.published') : t('knowledge.draft') }}
        </el-tag>
      </template>

      <template #column-categoryName="{ row }">
        {{ row.categoryName || '-' }}
      </template>

      <template #column-cover="{ row }">
        <el-image v-if="row.cover" :src="row.cover" style="width: 60px; height: 40px; border-radius: 4px; object-fit: cover" fit="cover" lazy>
          <template #error>
            <div class="cover-placeholder" />
          </template>
        </el-image>
        <div v-else class="cover-placeholder" />
      </template>

      <template #column-tags="{ row }">
        <el-tag v-for="tag in row.tags || []" :key="tag.id" :color="tag.color" style="color: #fff; margin-right: 4px; margin-bottom: 2px" size="small">
          {{ tag.name }}
        </el-tag>
        <span v-if="!row.tags?.length">-</span>
      </template>

      <template #column-publishTime="{ row }">
        {{ row.publishTime ? new Date(row.publishTime).toLocaleString() : '-' }}
      </template>

      <template #column-viewCount="{ row }">
        {{ row.viewCount || 0 }}
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="warning" link size="small" :icon="Edit" @click="openEdit(row as any)">
            {{ t('common.edit') }}
          </el-button>
          <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row as any)">
            {{ t('common.delete') }}
          </el-button>
        </div>
      </template>
    </ProTable>

    <el-drawer v-model="drawerVisible" :title="isEdit ? t('knowledge.editContent') : t('knowledge.addContent')" size="100%" direction="rtl" destroy-on-close>
      <template #default>
        <div class="drawer-body">
          <div class="drawer-left">
            <el-form ref="formRef" :model="form" label-position="top" :rules="rules">
              <el-form-item :label="t('knowledge.contentTitle')" prop="title">
                <el-input v-model="form.title" :placeholder="t('knowledge.inputContentTitle')" />
              </el-form-item>
              <el-form-item :label="t('knowledge.contentSummary')" prop="summary">
                <el-input v-model="form.summary" type="textarea" :rows="3" :placeholder="t('knowledge.inputContentSummary')" />
              </el-form-item>
              <el-form-item :label="t('knowledge.contentBody')" prop="body">
                <MdEditor
                  :model-value="form.body"
                  :language="locale === 'en-US' ? 'en-US' : 'zh-CN'"
                  :preview="false"
                  :toolbars-exclude="['github']"
                  :placeholder="t('knowledge.inputContentTitle')"
                  style="height: calc(100vh - 340px)"
                  @update:model-value="onBodyUpdate"
                />
              </el-form-item>
            </el-form>
          </div>
          <div class="drawer-right">
            <el-form label-position="top">
              <el-form-item>
                <template #label>
                  {{ t('knowledge.cover') }}
                </template>
                <div class="cover-wrapper">
                  <div v-if="form.cover" class="cover-preview">
                    <el-image :src="form.cover" fit="cover" style="width: 100%; height: 120px; border-radius: 4px" />
                    <el-button class="cover-remove" size="small" circle @click="form.cover = ''">
                      <el-icon><Close /></el-icon>
                    </el-button>
                    <el-button class="cover-change" size="small" type="primary" plain @click="coverPickerVisible = true">
                      {{ t('knowledge.changeCover') }}
                    </el-button>
                  </div>
                  <div v-else class="cover-empty cover-empty--action" @click="coverPickerVisible = true">
                    <el-icon :size="22">
                      <Picture />
                    </el-icon>
                    <span>{{ t('knowledge.selectCover') }}</span>
                    <span class="cover-empty-tip">{{ t('knowledge.noCoverTip') }}</span>
                  </div>
                </div>
              </el-form-item>
              <el-form-item :label="t('knowledge.category')">
                <el-tree-select
                  v-model="form.categoryId"
                  :data="categoryOptions"
                  :props="{ label: 'name', children: 'children' }"
                  node-key="id"
                  :placeholder="t('knowledge.selectCategory')"
                  clearable
                  check-strictly
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item :label="t('knowledge.tags')">
                <el-select v-model="form.tagIds" multiple collapse-tags :placeholder="t('knowledge.selectTags')" style="width: 100%">
                  <el-option v-for="tag in tagOptions" :key="tag.id" :label="tag.name" :value="tag.id">
                    <span>
                      <el-tag :color="tag.color" style="color: #fff; margin-right: 4px" size="small">{{ tag.name }}</el-tag>
                    </span>
                  </el-option>
                </el-select>
              </el-form-item>
              <el-form-item :label="t('knowledge.publishStatus')">
                <el-radio-group v-model="form.status">
                  <el-radio value="draft">
                    {{ t('knowledge.draft') }}
                  </el-radio>
                  <el-radio value="published">
                    {{ t('knowledge.published') }}
                  </el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item>
                <div class="drawer-actions">
                  <el-button @click="drawerVisible = false">
                    {{ t('common.cancel') }}
                  </el-button>
                  <el-button type="primary" :loading="submitLoading" style="margin-left: 0 !important" @click="handleSubmit">
                    {{ t('common.confirm') }}
                  </el-button>
                </div>
              </el-form-item>
            </el-form>
          </div>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="coverPickerVisible" :title="t('knowledge.coverPickerTitle')" width="640px" append-to-body destroy-on-close>
      <div class="cover-picker">
        <div class="cover-picker-current">
          <span class="cover-picker-label">{{ t('knowledge.currentCover') }}</span>
          <div v-if="form.cover" class="cover-picker-current-img">
            <el-image :src="form.cover" fit="cover" style="width: 160px; height: 90px; border-radius: 4px" />
            <el-button type="danger" size="small" link :icon="Close" @click="form.cover = ''">
              {{ t('knowledge.removeCover') }}
            </el-button>
          </div>
          <span v-else class="cover-picker-none">{{ t('knowledge.noCover') }}</span>
        </div>

        <el-divider />

        <div class="cover-image-list">
          <div v-for="(img, i) in imageList" :key="i" class="cover-image-item" :class="{ active: form.cover === img }" @click="form.cover = img">
            <el-image :src="img" fit="cover" lazy />
            <el-icon class="cover-image-check">
              <CircleCheck />
            </el-icon>
          </div>
          <div v-if="!imageList.length" class="cover-empty">
            {{ t('knowledge.coverEmpty') }}
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="coverPickerVisible = false">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Close, Picture, CircleCheck } from '@element-plus/icons-vue'
import { knowledgeCategoryApi, knowledgeTagApi, knowledgeContentApi } from '../api'
import { useI18n } from '@/i18n'
import ProTable from '@/components/ProTable/index.vue'
import { useCrud } from '@/composables/useCrud'
import type { KnowledgeContent, KnowledgeCategory, KnowledgeTag } from '../types'

const MdEditor = defineAsyncComponent(async () => {
  const { setupMdEditor } = await import('@/utils/mdEditorSetup')
  setupMdEditor()
  await import('md-editor-v3/lib/style.css')
  const mod = await import('md-editor-v3')
  return mod.MdEditor
})

const { t, locale } = useI18n()
const formRef = ref()

const drawerVisible = ref(false)
const isEdit = ref(false)
const coverPickerVisible = ref(false)
const submitLoading = ref(false)

const searchFields = computed(() => [
  { prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('knowledge.searchContent') },
  {
    prop: 'categoryId',
    label: t('knowledge.category'),
    type: 'select',
    placeholder: t('common.all'),
    options: () => categoryOptions.value.map((c: KnowledgeCategory) => ({ label: c.name, value: c.id })),
  },
  {
    prop: 'status',
    label: t('knowledge.publishStatus'),
    type: 'select',
    placeholder: t('common.all'),
    options: () => [
      { label: t('knowledge.published'), value: 'published' },
      { label: t('knowledge.draft'), value: 'draft' },
    ],
  },
])

const columns = computed(() => [
  { prop: 'index', label: t('common.index'), width: 60 },
  { prop: 'cover', label: t('knowledge.cover'), width: 90, align: 'center' },
  { prop: 'title', label: t('knowledge.contentTitle'), minWidth: 200, showOverflowTooltip: true },
  { prop: 'categoryName', label: t('knowledge.category'), width: 120 },
  { prop: 'tags', label: t('knowledge.tags'), width: 200 },
  { prop: 'status', label: t('knowledge.publishStatus'), width: 100, align: 'center' },
  { prop: 'publishTime', label: t('knowledge.publishTime'), width: 180 },
  { prop: 'viewCount', label: t('knowledge.viewCount'), width: 90, align: 'center' },
  { prop: 'actions', label: t('common.actions'), width: 160, fixed: 'right' },
])

const categoryOptions = ref<KnowledgeCategory[]>([])
const tagOptions = ref<KnowledgeTag[]>([])

const form = ref({
  id: undefined as number | undefined,
  title: '',
  summary: '',
  body: '',
  cover: '',
  categoryId: undefined as number | undefined,
  tagIds: [] as number[],
  status: 'draft' as 'draft' | 'published',
})

const defaultForm = () => ({
  id: undefined as number | undefined,
  title: '',
  summary: '',
  body: '',
  cover: '',
  categoryId: undefined as number | undefined,
  tagIds: [] as number[],
  status: 'draft' as 'draft' | 'published',
})

const { list, loading, pagination, searchParams, onQuery, fetchData } = useCrud<KnowledgeContent>({
  api: knowledgeContentApi,
  defaultForm: defaultForm(),
  defaultSearchParams: { keyword: '', categoryId: '', status: '' },
  defaultPagination: { pageNum: 1, pageSize: 20 },
})

const rules = {
  title: [{ required: true, message: () => t('knowledge.inputContentTitle'), trigger: 'blur' }],
}

function extractAllImages(body: string): string[] {
  const regex = /!\[.*?\]\(\s*([^\s()]+(?:\s+[^\s()]+)*?)\s*(?:["'][^"']*["'])?\s*\)/g
  const urls: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(body)) !== null) {
    const url = match[1].trim()
    if (url && !urls.includes(url)) urls.push(url)
  }
  return urls
}

const imageList = computed(() => extractAllImages(form.value.body))

function onBodyUpdate(value: string) {
  form.value.body = value
  if (!form.value.cover) {
    const images = extractAllImages(value)
    if (images.length) form.value.cover = images[0]
  }
}

async function loadOptions() {
  try {
    const [catRes, tagRes] = await Promise.all([knowledgeCategoryApi.options(), knowledgeTagApi.options()])
    categoryOptions.value = catRes.data
    tagOptions.value = tagRes.data
  } catch {
    // silent
  }
}

function openCreate() {
  isEdit.value = false
  form.value = defaultForm()
  drawerVisible.value = true
}

async function openEdit(row: Record<string, unknown>) {
  isEdit.value = true
  try {
    const res = await knowledgeContentApi.getById(row.id as number)
    const data = res.data
    form.value = {
      id: data.id,
      title: data.title,
      summary: data.summary || '',
      body: data.body || '',
      cover: data.cover || '',
      categoryId: data.categoryId || undefined,
      tagIds: data.tags?.map((t) => t.id) || [],
      status: data.status || 'draft',
    }
  } catch {
    form.value = {
      id: row.id as number,
      title: (row.title as string) || '',
      summary: (row.summary as string) || '',
      body: (row.body as string) || '',
      cover: (row.cover as string) || '',
      categoryId: row.categoryId as number | undefined,
      tagIds: (row as unknown as KnowledgeContent).tagIds || [],
      status: ((row.status as string) || 'draft') as 'draft' | 'published',
    }
  }
  drawerVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitLoading.value = true
  try {
    const payload = { ...form.value }
    const { id, ...data } = payload
    if (isEdit.value && id) {
      await knowledgeContentApi.update(id, data)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await knowledgeContentApi.create(data)
      ElMessage.success(t('common.createSuccess'))
    }
    drawerVisible.value = false
    fetchData()
  } catch {
    ElMessage.error(t('common.operationFailed'))
  } finally {
    submitLoading.value = false
  }
}

const handleDelete = async (row: Record<string, unknown>) => {
  try {
    await ElMessageBox.confirm(t('knowledge.deleteContentConfirm', { title: row.title as string }), t('common.tip'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
    await knowledgeContentApi.delete(row.id as number)
    ElMessage.success(t('messages.deleteSuccess'))
    fetchData()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(t('common.operationFailed'))
    }
  }
}

onMounted(() => {
  fetchData()
  loadOptions()
})
</script>

<style lang="scss" scoped>
.table-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.drawer-body {
  display: flex;
  gap: 24px;
  height: 100%;
}

:deep(.el-drawer__body) {
  padding-top: 0;
}

.drawer-left {
  flex: 1;
  min-width: 0;
}

.drawer-right {
  width: 300px;
  flex-shrink: 0;
  border-left: 1px solid var(--el-border-color-light);
  padding-left: 24px;
}

.drawer-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.cover-placeholder {
  width: 60px;
  height: 40px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.cover-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.cover-preview {
  position: relative;
  width: 100%;
}

.cover-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  --el-button-size: 24px;
}

.cover-change {
  margin-top: 8px;
  width: 100%;
}

.cover-empty--action {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px 0;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  transition:
    border-color 0.2s,
    color 0.2s;
  &:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
  }
  .cover-empty-tip {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
  }
}

.cover-picker {
  .cover-picker-current {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .cover-picker-label {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }
  .cover-picker-current-img {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cover-picker-none {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.cover-image-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
}

.cover-image-item {
  position: relative;
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 4px;
  overflow: hidden;
  transition: border-color 0.2s;
}

.cover-image-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.cover-image-item.active {
  border-color: var(--el-color-primary);
}

.cover-image-item .el-image {
  display: block;
  width: 100%;
  height: 80px;
}

.cover-image-check {
  position: absolute;
  top: 4px;
  right: 4px;
  color: var(--el-color-primary);
  background: var(--el-bg-color);
  border-radius: 50%;
  font-size: 18px;
  opacity: 0;
}

.cover-image-item.active .cover-image-check {
  opacity: 1;
}

.cover-empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
  padding: 12px 0;
  grid-column: 1 / -1;
}

.drawer-actions :deep(.el-button) {
  width: 100%;
}
</style>
