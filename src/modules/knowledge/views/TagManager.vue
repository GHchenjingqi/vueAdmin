<template>
  <div class="page-container">
    <ProTable
      :title="t('knowledge.tag')"
      :columns="columns"
      :data="list"
      :loading="loading"
      :show-pagination="true"
      :pagination="pagination"
      :search-params="searchParams"
      :search-fields="searchFields"
      column-settings-key="knowledge_tag_list"
      @query="onQuery"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openCreate()">
          {{ t('knowledge.addTag') }}
        </el-button>
      </template>

      <template #column-color="{ row }">
        <el-tag :color="row.color" style="color: #fff" size="small">
          {{ row.name }}
        </el-tag>
      </template>

      <template #column-createdAt="{ row }">
        {{ row.createdAt ? new Date(row.createdAt).toLocaleString() : '-' }}
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

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? t('knowledge.editTag') : t('knowledge.addTag')"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" label-width="100px" :rules="rules">
        <el-form-item :label="t('knowledge.tagName')" prop="name">
          <el-input v-model="form.name" :placeholder="t('knowledge.inputTagName')" />
        </el-form-item>
        <el-form-item :label="t('knowledge.tagColor')" prop="color">
          <el-color-picker v-model="form.color" show-alpha />
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
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { knowledgeTagApi } from '../api'
import { useI18n } from '@/i18n'
import ProTable from '@/components/ProTable/index.vue'
import { useCrud } from '@/composables/useCrud'
import type { KnowledgeTag } from '../types'

const { t } = useI18n()
const formRef = ref()

const searchFields = computed(() => [{ prop: 'keyword', label: t('common.keyword'), type: 'input', placeholder: t('knowledge.searchTag') }])

const columns = computed(() => [
  { prop: 'index', label: t('common.index'), width: 60 },
  { prop: 'name', label: t('knowledge.tagName'), minWidth: 160 },
  { prop: 'color', label: t('knowledge.tagColor'), width: 120, align: 'center' },
  { prop: 'createdAt', label: t('common.createdTime'), width: 180 },
  { prop: 'actions', label: t('common.actions'), width: 160, fixed: 'right' },
])

const defaultForm: Partial<KnowledgeTag> = { name: '', color: '#409EFF' }

const { list, loading, pagination, searchParams, dialogVisible, isEdit, submitLoading, form, onQuery, openCreate, openEdit, fetchData } = useCrud<KnowledgeTag>(
  {
    api: knowledgeTagApi,
    defaultForm,
    defaultSearchParams: { keyword: '' },
    defaultPagination: { pageNum: 1, pageSize: 20 },
  },
)

// 覆盖 useCrud 的 handleDelete，使用 i18n
const handleDelete = async (row: Record<string, unknown>) => {
  try {
    await ElMessageBox.confirm(t('knowledge.deleteTagConfirm', { name: row.name as string }), t('common.tip'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
    await knowledgeTagApi.delete(row.id as number)
    ElMessage.success(t('messages.deleteSuccess'))
    fetchData()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(t('common.operationFailed'))
    }
  }
}

const rules = {
  name: [{ required: true, message: () => t('knowledge.inputTagName'), trigger: 'blur' }],
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitLoading.value = true
  try {
    const payload = { ...form } as Partial<KnowledgeTag>
    if (isEdit.value && form.id) {
      await knowledgeTagApi.update(form.id, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await knowledgeTagApi.create(payload)
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
    fetchData()
  } catch {
    ElMessage.error(t('common.operationFailed'))
  } finally {
    submitLoading.value = false
  }
}

onMounted(fetchData)
</script>

<style lang="scss" scoped>
.table-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
