<template>
  <div class="page-container">
    <div class="knowledge-toolbar">
      <div class="toolbar-left">
        <el-button type="primary" :icon="Plus" @click="openCreate()">
          {{ t('knowledge.addCategory') }}
        </el-button>
      </div>
    </div>

    <el-table
      :data="treeData"
      row-key="id"
      :loading="loading"
      default-expand-all
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
      border
      stripe
    >
      <el-table-column prop="name" :label="t('knowledge.categoryName')" min-width="240" />
      <el-table-column prop="sort" :label="t('knowledge.sort')" width="80" align="center" />
      <el-table-column prop="status" :label="t('knowledge.status')" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
            {{ row.status === 1 ? t('knowledge.enabled') : t('knowledge.disabled') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="180" fixed="right">
        <template #default="{ row }">
          <el-button type="warning" link size="small" :icon="Edit" @click="openEdit(row as any)">
            {{ t('common.edit') }}
          </el-button>
          <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(row as any)">
            {{ t('common.delete') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? t('knowledge.editCategory') : t('knowledge.addCategory')"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" label-width="100px" :rules="rules">
        <el-form-item :label="t('knowledge.categoryName')" prop="name">
          <el-input v-model="form.name" :placeholder="t('knowledge.inputCategoryName')" />
        </el-form-item>
        <el-form-item :label="t('knowledge.parentCategory')" prop="parentId">
          <el-tree-select
            v-model="form.parentId"
            :data="parentOptions"
            :props="{ label: 'name', children: 'children' }"
            node-key="id"
            :placeholder="t('knowledge.selectParentCategory')"
            clearable
            check-strictly
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('knowledge.sort')" prop="sort">
          <el-input-number v-model="form.sort" :min="0" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('knowledge.status')" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">
              {{ t('knowledge.enabled') }}
            </el-radio>
            <el-radio :value="0">
              {{ t('knowledge.disabled') }}
            </el-radio>
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
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { knowledgeCategoryApi } from '../api'
import { useI18n } from '@/i18n'
import type { KnowledgeCategory } from '../types'

const { t } = useI18n()

const treeData = ref<KnowledgeCategory[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const currentId = ref<number | null>(null)
const formRef = ref()

const form = ref({
  name: '',
  parentId: undefined as number | undefined,
  sort: 0,
  status: 1,
})

const parentOptions = ref<KnowledgeCategory[]>([])

const rules = {
  name: [{ required: true, message: () => t('knowledge.inputCategoryName'), trigger: 'blur' }],
}

async function fetchData() {
  loading.value = true
  try {
    const res = await knowledgeCategoryApi.list()
    treeData.value = res.data
  } catch {
    ElMessage.error(t('knowledge.fetchCategoryFailed'))
  } finally {
    loading.value = false
  }
}

async function fetchOptions() {
  try {
    const res = await knowledgeCategoryApi.options()
    parentOptions.value = res.data
  } catch {
    // silent
  }
}

function openCreate() {
  isEdit.value = false
  currentId.value = null
  form.value = { name: '', parentId: undefined, sort: 0, status: 1 }
  dialogVisible.value = true
}

function openEdit(row: KnowledgeCategory) {
  isEdit.value = true
  currentId.value = row.id
  form.value = { name: row.name, parentId: row.parentId || undefined, sort: row.sort, status: row.status }
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitLoading.value = true
  try {
    const payload = { ...form.value }
    if (isEdit.value && currentId.value !== null) {
      await knowledgeCategoryApi.update(currentId.value, payload)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await knowledgeCategoryApi.create(payload)
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
    fetchData()
    fetchOptions()
  } catch {
    ElMessage.error(t('common.operationFailed'))
  } finally {
    submitLoading.value = false
  }
}

async function handleDelete(row: KnowledgeCategory) {
  try {
    await ElMessageBox.confirm(t('knowledge.deleteCategoryConfirm', { name: row.name }), t('common.tip'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
    await knowledgeCategoryApi.delete(row.id)
    ElMessage.success(t('messages.deleteSuccess'))
    fetchData()
    fetchOptions()
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(t('common.operationFailed'))
    }
  }
}

onMounted(() => {
  fetchData()
  fetchOptions()
})
</script>

<style lang="scss" scoped>
.knowledge-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
</style>
