<template>
  <div class="page-container">
    <ProTable
      :key="locale"
      :title="t('shop.category.title')"
      :columns="columns"
      :data="tree"
      :loading="loading"
      :show-pagination="false"
      :pagination="pagination"
      row-key="id"
      :tree-props="{ children: 'children' }"
    >
      <template #header-buttons>
        <el-button type="primary" :icon="Plus" @click="openDialog()">
          {{ t('shop.category.add') }}
        </el-button>
        <el-button :icon="Refresh" @click="fetchTree">
          {{ t('common.refresh') }}
        </el-button>
      </template>

      <template #column-name="{ row }">
        <span>{{ displayName(row.name) }}</span>
      </template>

      <template #column-actions="{ row }">
        <div class="table-actions">
          <el-button type="primary" link size="small" :icon="Plus" @click="openDialog(undefined, row)">
            {{ t('shop.category.addChild') }}
          </el-button>
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
      :title="isEdit ? t('shop.category.edit') : t('shop.category.add')"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item :label="t('shop.category.parent')">
          <el-tree-select
            v-model="form.parentId"
            :data="parentOptions"
            :props="{ label: 'label', children: 'children', disabled: 'disabled' }"
            node-key="value"
            check-strictly
            clearable
            :placeholder="t('shop.category.parentPlaceholder')"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('shop.category.nameZh')" prop="nameZh">
          <el-input v-model="form.nameZh" maxlength="50" :placeholder="t('shop.category.nameZhPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.category.nameEn')">
          <el-input v-model="form.nameEn" maxlength="50" :placeholder="t('shop.category.nameEnPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('shop.category.sort')">
          <el-input-number v-model="form.sort" :min="0" />
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
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, Edit, Delete, Refresh } from '@element-plus/icons-vue'
import { categoryApi, type Category, type CategoryTreeNode } from '@/api/shop'
import { getErrorMessage } from '@/utils/error'
import ProTable from '@/components/ProTable/index.vue'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const columns = computed(() => [
  { prop: 'name', label: t('shop.category.colName'), minWidth: 220 },
  { prop: 'level', label: t('shop.category.colLevel'), width: 80, align: 'center' },
  { prop: 'sort', label: t('shop.category.sort'), width: 80, align: 'center' },
  { prop: 'actions', label: t('common.operation'), width: 240, fixed: 'right' },
])

const tree = ref<CategoryTreeNode[]>([])
const loading = ref(false)
const pagination = reactive({ pageNum: 1, pageSize: 10, total: 0 })

const fetchTree = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await categoryApi.tree()
    tree.value = res.data
  } catch (err: unknown) {
    ElMessage.error(t('shop.category.fetchFailed') + ': ' + getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

/** 多语言名称展示：当前语言优先，回退 zh-CN / 首个 */
function displayName(name: Record<string, string>): string {
  return name[locale.value] || name['zh-CN'] || Object.values(name)[0] || '-'
}

// ==================== 新增/编辑弹窗 ====================
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref<FormInstance | null>(null)
const currentId = ref<number | null>(null)
/** 编辑时禁止选择的父类目（自身及子孙，防成环） */
const excludeParentIds = ref<number[]>([])

const form = reactive({
  parentId: 0 as number,
  nameZh: '',
  nameEn: '',
  sort: 0,
})

const rules = computed<FormRules>(() => ({
  nameZh: [{ required: true, message: t('shop.category.nameZhPlaceholder'), trigger: 'blur' }],
}))

interface ParentOption {
  value: number
  label: string
  children?: ParentOption[]
  disabled?: boolean
}

const parentOptions = computed<ParentOption[]>(() => {
  const toOption = (node: CategoryTreeNode): ParentOption => ({
    value: node.id,
    label: displayName(node.name),
    disabled: excludeParentIds.value.includes(node.id),
    children: node.children?.map(toOption),
  })
  return [{ value: 0, label: t('shop.category.root'), children: tree.value.map(toOption) }]
})

const openDialog = (target?: Record<string, unknown>, parentNode?: Record<string, unknown>): void => {
  const row = target as unknown as Category | undefined
  const parentRow = parentNode as unknown as CategoryTreeNode | undefined
  excludeParentIds.value = []
  if (row) {
    isEdit.value = true
    currentId.value = row.id
    form.parentId = row.parentId
    form.nameZh = row.name['zh-CN'] || ''
    form.nameEn = row.name['en-US'] || ''
    form.sort = row.sort
    // 收集自身及子孙 id，禁止选为父类目
    const collect = (node: CategoryTreeNode): void => {
      excludeParentIds.value.push(node.id)
      node.children?.forEach(collect)
    }
    const target = findNode(tree.value, row.id)
    if (target) collect(target)
  } else {
    isEdit.value = false
    currentId.value = null
    form.parentId = parentRow?.id ?? 0
    form.nameZh = ''
    form.nameEn = ''
    form.sort = 0
  }
  dialogVisible.value = true
}

function findNode(nodes: CategoryTreeNode[], id: number): CategoryTreeNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = n.children ? findNode(n.children, id) : undefined
    if (found) return found
  }
  return undefined
}

const handleSubmit = async (): Promise<void> => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  const name: Record<string, string> = { 'zh-CN': form.nameZh.trim() }
  if (form.nameEn.trim()) name['en-US'] = form.nameEn.trim()

  submitLoading.value = true
  try {
    if (isEdit.value && currentId.value != null) {
      await categoryApi.update(currentId.value, { parentId: form.parentId, name, sort: form.sort })
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await categoryApi.create({ parentId: form.parentId, name, sort: form.sort })
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
    fetchTree()
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    submitLoading.value = false
  }
}

const handleDelete = (target: Record<string, unknown>): void => {
  const row = target as unknown as CategoryTreeNode
  ElMessageBox.confirm(`${t('shop.category.deleteConfirm')}「${displayName(row.name)}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await categoryApi.remove(row.id)
        ElMessage.success(t('messages.deleteSuccess'))
        fetchTree()
      } catch (err: unknown) {
        ElMessage.error(getErrorMessage(err))
      }
    })
    .catch(() => {
      // 用户取消
    })
}

onMounted(fetchTree)
</script>
