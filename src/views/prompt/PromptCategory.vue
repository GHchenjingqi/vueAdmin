<template>
  <div class="page-container">
    <el-card shadow="never">
      <template #header>
        <div class="category-toolbar">
          <span class="category-title">{{ t('prompt.categoryTitle') }}</span>
          <div class="category-toolbar-actions">
            <el-input
              v-model="keyword"
              :placeholder="t('prompt.keywordPlaceholder')"
              clearable
              style="width: 220px"
              @keyup.enter="() => {}"
              @clear="() => {}"
            />
            <el-button type="primary" :icon="Plus" @click="openDialog()">{{ t('prompt.addCategory') }}</el-button>
          </div>
        </div>
      </template>

      <p class="category-hint">{{ t('prompt.categoryDragHint') }}</p>

      <el-table
        :key="locale"
        v-loading="loading"
        :data="treeRows"
        row-key="id"
        default-expand-all
        :tree-props="{ children: 'children' }"
        class="category-table"
        :row-class-name="rowClassName"
        @row-click="() => {}"
      >
        <el-table-column :label="t('prompt.categoryName')" min-width="260">
          <template #default="{ row }">
            <div
              class="category-name-cell"
              :class="{ 'drop-target': dragOverId === asCategory(row).id && canDropOn(asCategory(row)), 'drag-disabled': !canDragRow(row) }"
              draggable="true"
              @dragstart="onDragStart($event, asCategory(row))"
              @dragend="onDragEnd"
              @dragover.prevent="onDragOver($event, asCategory(row))"
              @dragleave="onDragLeave(asCategory(row))"
              @drop.prevent="onDrop($event, asCategory(row))"
            >
              <el-icon v-if="canDragRow(row)" class="drag-handle"><Rank /></el-icon>
              <span class="category-name">{{ asCategory(row).name }}</span>
              <el-tag v-if="asCategory(row).parentId" size="small" type="info" effect="plain">{{ t('prompt.subCategory') }}</el-tag>
              <el-tag v-if="isSpecialName(asCategory(row).name)" size="small" type="warning" effect="plain">{{ t('prompt.specialCategory') }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="description" :label="t('prompt.description')" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.description || '-' }}</template>
        </el-table-column>
        <el-table-column prop="sort" :label="t('prompt.sort')" width="80" align="center" />
        <el-table-column :label="t('common.status')" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
              {{ row.status === 1 ? t('common.enable') : t('common.disable') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="promptCount" :label="t('prompt.promptCount')" width="100" align="center" />
        <el-table-column :label="t('common.operation')" width="240" fixed="right">
          <template #default="{ row }">
            <div class="table-actions" @click.stop>
              <el-button v-if="!asCategory(row).parentId" type="primary" link size="small" @click="openDialog(undefined, asCategory(row))">
                {{ t('prompt.addSubCategory') }}
              </el-button>
              <el-button v-if="asCategory(row).parentId" type="info" link size="small" @click="moveToRoot(asCategory(row))">
                {{ t('prompt.moveToRoot') }}
              </el-button>
              <el-button type="warning" link size="small" :icon="Edit" @click="openDialog(asCategory(row))">{{ t('common.edit') }}</el-button>
              <el-button type="danger" link size="small" :icon="Delete" @click="handleDelete(asCategory(row))">{{ t('common.delete') }}</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? t('prompt.editCategory') : t('prompt.addCategory')"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form label-width="90px">
        <el-form-item :label="t('prompt.parentCategory')">
          <el-select v-model="form.parentId" clearable style="width: 100%" :placeholder="t('prompt.parentCategoryPlaceholder')" :disabled="form.parentLocked">
            <el-option v-for="item in rootOptions" :key="item.id" :label="item.name" :value="item.id" :disabled="item.id === currentId" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('prompt.categoryName')" required>
          <el-input v-model="form.name" maxlength="30" />
        </el-form-item>
        <el-form-item :label="t('prompt.description')">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item :label="t('prompt.sort')">
          <el-input-number v-model="form.sort" :min="0" />
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-switch v-model="form.status" :active-text="t('common.enable')" :inactive-text="t('common.disable')" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Rank } from '@element-plus/icons-vue'
import { promptApi, type PromptCategory } from '@/api/prompt'
import { getErrorMessage } from '@/utils/error'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()

const rows = ref<PromptCategory[]>([])
const loading = ref(false)
const keyword = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const currentId = ref<number | null>(null)
const form = reactive<{ name: string; description: string; sort: number; status: number; parentId: number | null; parentLocked: boolean }>({
  name: '',
  description: '',
  sort: 0,
  status: 1,
  parentId: null,
  parentLocked: false,
})

const draggingId = ref<number | null>(null)
const dragOverId = ref<number | null>(null)

/** 特殊分类（提示词专题 / 角色库）由系统专用，编辑时提示但不禁用 */
const SPECIAL_NAMES = ['提示词', '角色库']
const isSpecialName = (name: string): boolean => SPECIAL_NAMES.includes(name)

/** el-table 插槽 row 类型为 DefaultRow，统一收敛为 PromptCategory */
const asCategory = (row: unknown): PromptCategory => row as PromptCategory

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return rows.value
  return rows.value.filter(
    (row) =>
      String(row.name).toLowerCase().includes(k) ||
      String(row.description || '')
        .toLowerCase()
        .includes(k),
  )
})

/** 两级树：一级分类带 children；子分类挂在对应父节点下 */
const treeRows = computed(() => {
  const list = filtered.value
  const roots = list.filter((row) => !row.parentId)
  return roots.map((root) => ({ ...root, children: list.filter((row) => Number(row.parentId) === root.id) }))
})

const rootOptions = computed(() => rows.value.filter((row) => !row.parentId))

const canDragRow = (_row?: unknown): boolean => true
/** 只能并入一级分类；已含子分类的分类不能并入其他分类（避免三级层级） */
const canDropOn = (target: PromptCategory): boolean => {
  if (draggingId.value === null || draggingId.value === target.id) return false
  if (target.parentId) return false
  return !rows.value.some((row) => Number(row.parentId) === draggingId.value)
}

const rowClassName = ({ row }: { row: PromptCategory }): string => (draggingId.value === row.id ? 'category-row-dragging' : '')

const fetchRows = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await promptApi.getCategories({ page: 1, pageSize: 200 })
    rows.value = res.data.rows
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const onDragStart = (event: DragEvent, row: PromptCategory): void => {
  draggingId.value = row.id
  event.dataTransfer?.setData('text/plain', String(row.id))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

const onDragEnd = (): void => {
  draggingId.value = null
  dragOverId.value = null
}

const onDragOver = (event: DragEvent, row: PromptCategory): void => {
  if (draggingId.value === null) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = canDropOn(row) ? 'move' : 'none'
  dragOverId.value = canDropOn(row) ? row.id : null
}

const onDragLeave = (row: PromptCategory): void => {
  if (dragOverId.value === row.id) dragOverId.value = null
}

/** 拖拽并入：把拖动分类并入目标一级分类；拖回一级区域即恢复顶级 */
const onDrop = async (event: DragEvent, target: PromptCategory): Promise<void> => {
  const raw = event.dataTransfer?.getData('text/plain')
  const dragId = draggingId.value ?? (raw ? Number(raw) : null)
  draggingId.value = null
  dragOverId.value = null
  if (!dragId || dragId === target.id) return
  await mergeCategory(dragId, target.id)
}

/** 把某个分类并入目标一级分类（targetId 传 null 恢复为顶级） */
const mergeCategory = async (dragId: number, targetId: number | null): Promise<void> => {
  const source = rows.value.find((row) => row.id === dragId)
  const target = targetId === null ? null : rows.value.find((row) => row.id === targetId)
  if (!source) return
  if (targetId !== null && !target) return
  try {
    await promptApi.updateCategory(dragId, { parentId: targetId })
    ElMessage.success(target ? t('prompt.mergeSuccess', { source: source.name, target: target.name }) : t('prompt.moveToRootSuccess', { source: source.name }))
    fetchRows()
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err))
  }
}

const moveToRoot = (row: PromptCategory): void => {
  void mergeCategory(row.id, null)
}

const openDialog = (row?: PromptCategory, parent?: PromptCategory): void => {
  if (row) {
    isEdit.value = true
    currentId.value = row.id
    form.name = row.name
    form.description = row.description ?? ''
    form.sort = row.sort
    form.status = row.status
    form.parentId = row.parentId ?? null
    form.parentLocked = Boolean(row.parentId && !parent)
  } else {
    isEdit.value = false
    currentId.value = null
    form.name = ''
    form.description = ''
    form.sort = 0
    form.status = 1
    form.parentId = parent ? parent.id : null
    form.parentLocked = Boolean(parent)
  }
  dialogVisible.value = true
}

const handleSubmit = async (): Promise<void> => {
  if (!form.name.trim()) {
    ElMessage.warning(t('prompt.categoryNameRequired'))
    return
  }
  submitting.value = true
  try {
    const payload = { name: form.name.trim(), description: form.description, sort: form.sort, status: form.status, parentId: form.parentId }
    if (isEdit.value && currentId.value !== null) {
      await promptApi.updateCategory(currentId.value, payload)
      ElMessage.success(t('common.success'))
    } else {
      await promptApi.createCategory(payload)
      ElMessage.success(t('common.success'))
    }
    dialogVisible.value = false
    fetchRows()
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err))
  } finally {
    submitting.value = false
  }
}

const handleDelete = (row: PromptCategory): void => {
  ElMessageBox.confirm(`${t('prompt.categoryDeleteConfirm')}「${row.name}」`, t('common.confirm'), {
    type: 'warning',
    confirmButtonText: t('common.delete'),
    cancelButtonText: t('common.cancel'),
  })
    .then(async () => {
      try {
        await promptApi.deleteCategory(row.id)
        ElMessage.success(t('common.success'))
        fetchRows()
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: string } } }
        ElMessage.error(axiosErr.response?.data?.message || getErrorMessage(err))
      }
    })
    .catch(() => undefined)
}

onMounted(fetchRows)
</script>

<style scoped>
.category-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.category-title {
  font-weight: 600;
}
.category-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.category-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.category-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: grab;
}
.category-name-cell.drag-disabled {
  cursor: default;
}
.category-name-cell.drop-target {
  outline: 2px dashed var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.drag-handle {
  color: var(--el-text-color-placeholder);
}
.category-row-dragging {
  opacity: 0.5;
}
.table-actions {
  display: flex;
  align-items: center;
}
</style>
