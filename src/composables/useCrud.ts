/**
 * 通用 CRUD 组合式 API
 *
 * 封装列表查询、分页、搜索、创建/更新/删除/批量删除逻辑
 * 配合 ProTable 和 FormDialog 使用，减少重复代码
 */
import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ApiResponse, PaginatedData } from '@/types/response'

export interface CrudApi<T extends { id?: number }> {
  list: (params: Record<string, unknown>) => Promise<ApiResponse<PaginatedData<T>>>
  getById?: (id: number) => Promise<ApiResponse<T>>
  create: (data: Partial<T>) => Promise<ApiResponse<T>>
  update: (id: number, data: Partial<T>) => Promise<ApiResponse<T>>
  delete: (id: number) => Promise<ApiResponse<null>>
  batchDelete?: (ids: number[]) => Promise<ApiResponse<null>>
  export?: (params: Record<string, unknown>) => Promise<Blob>
}

export interface UseCrudOptions<T extends { id: number }> {
  api: CrudApi<T>
  defaultForm: Partial<T>
  defaultSearchParams?: Record<string, unknown>
  defaultPagination?: { pageNum: number; pageSize: number }
  transform?: (data: Partial<T>) => Partial<T>
  afterSubmit?: () => void
  onDeleteSuccess?: () => void
}

export function useCrud<T extends { id: number }>(options: UseCrudOptions<T>) {
  const {
    api,
    defaultForm,
    defaultSearchParams = {},
    defaultPagination = { pageNum: 1, pageSize: 10 },
    transform = (data) => data,
    afterSubmit,
    onDeleteSuccess,
  } = options

  const list = ref<T[]>([])
  const loading = ref(false)
  const pagination = reactive({
    pageNum: defaultPagination.pageNum,
    pageSize: defaultPagination.pageSize,
    total: 0,
  })
  const searchParams = reactive({ ...defaultSearchParams })
  const selectedIds = ref<number[]>([])
  const selectedRows = ref<T[]>([])

  const dialogVisible = ref(false)
  const isEdit = ref(false)
  const submitLoading = ref(false)
  const currentId = ref<number | null>(null)
  const form = reactive({ ...defaultForm })

  /**
   * 获取列表数据
   */
  async function fetchData(): Promise<void> {
    loading.value = true
    try {
      const params = {
        page: pagination.pageNum,
        pageSize: pagination.pageSize,
        ...searchParams,
      }
      const res = await api.list(params)
      list.value = res.data.rows
      pagination.total = res.data.total
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '获取列表失败'
      ElMessage.error(msg)
    } finally {
      loading.value = false
    }
  }

  /**
   * 查询回调（由 ProTable 触发）
   */
  function onQuery(params: { pagination?: { pageNum: number; pageSize: number }; searchParams?: Record<string, unknown> }): void {
    if (params.pagination) {
      Object.assign(pagination, params.pagination)
    }
    if (params.searchParams) {
      Object.assign(searchParams, params.searchParams)
    }
    fetchData()
  }

  /**
   * 重置搜索
   */
  function resetSearch(): void {
    Object.assign(searchParams, defaultSearchParams)
    pagination.pageNum = 1
    fetchData()
  }

  /**
   * 选中变化
   */
  function handleSelectionChange(selection: T[]): void {
    selectedIds.value = selection.map((row) => row.id)
    selectedRows.value = selection
  }

  /**
   * 批量删除
   */
  async function handleBatchDelete(): Promise<void> {
    if (selectedIds.value.length === 0) {
      ElMessage.warning('请选择要删除的项')
      return
    }
    if (!api.batchDelete) {
      ElMessage.error('当前接口不支持批量删除')
      return
    }
    try {
      await ElMessageBox.confirm(`确定要删除选中的 ${selectedIds.value.length} 项吗？`, '批量删除', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })
      await api.batchDelete(selectedIds.value)
      ElMessage.success('批量删除成功')
      selectedIds.value = []
      selectedRows.value = []
      fetchData()
      onDeleteSuccess?.()
    } catch (err) {
      if (err !== 'cancel') {
        const msg = err instanceof Error ? err.message : '批量删除失败'
        ElMessage.error(msg)
      }
    }
  }

  /**
   * 打开创建对话框
   */
  function openCreate(): void {
    isEdit.value = false
    currentId.value = null
    Object.assign(form, { ...defaultForm })
    dialogVisible.value = true
  }

  /**
   * 打开编辑对话框
   */
  async function openEdit(row: Record<string, unknown>): Promise<void> {
    isEdit.value = true
    currentId.value = row.id as number
    if (api.getById) {
      try {
        loading.value = true
        const res = await api.getById(row.id as number)
        Object.assign(form, { ...res.data })
      } catch {
        Object.assign(form, { ...row })
      } finally {
        loading.value = false
      }
    } else {
      Object.assign(form, { ...row })
    }
    dialogVisible.value = true
  }

  /**
   * 删除单条
   */
  async function handleDelete(row: Record<string, unknown>): Promise<void> {
    try {
      await ElMessageBox.confirm(`确定要删除该项吗？`, '提示', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' })
      await api.delete(row.id as number)
      ElMessage.success('删除成功')
      fetchData()
      onDeleteSuccess?.()
    } catch (err) {
      if (err !== 'cancel') {
        const msg = err instanceof Error ? err.message : '删除失败'
        ElMessage.error(msg)
      }
    }
  }

  /**
   * 提交创建/编辑
   */
  async function handleSubmit(): Promise<boolean> {
    submitLoading.value = true
    try {
      const payload = transform({ ...(form as Partial<T>) })
      if (isEdit.value && currentId.value !== null) {
        await api.update(currentId.value, payload)
        ElMessage.success('更新成功')
      } else {
        await api.create(payload as Partial<T>)
        ElMessage.success('创建成功')
      }
      dialogVisible.value = false
      fetchData()
      afterSubmit?.()
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败'
      ElMessage.error(msg)
      return false
    } finally {
      submitLoading.value = false
    }
  }

  /**
   * 关闭对话框
   */
  function closeDialog(): void {
    dialogVisible.value = false
  }

  /**
   * 刷新列表
   */
  function refresh(): void {
    fetchData()
  }

  const hasSelection = computed(() => selectedIds.value.length > 0)

  return {
    list,
    loading,
    pagination,
    searchParams,
    selectedIds,
    selectedRows,
    dialogVisible,
    isEdit,
    submitLoading,
    currentId,
    form,
    hasSelection,
    fetchData,
    onQuery,
    resetSearch,
    handleSelectionChange,
    handleBatchDelete,
    openCreate,
    openEdit,
    handleDelete,
    handleSubmit,
    closeDialog,
    refresh,
  }
}
