import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCrud } from '@/composables/useCrud'
import type { CrudApi } from '@/composables/useCrud'
import type { ApiResponse, PaginatedData } from '@/types/response'

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn(),
  },
}))

describe('useCrud', () => {
  interface TestEntity {
    id: number
    name: string
    status: number
  }

  const mockApi: CrudApi<TestEntity> = {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    batchDelete: vi.fn(),
  }

  const defaultOptions = {
    api: mockApi,
    defaultForm: { id: 0, name: '', status: 1 },
    defaultSearchParams: {},
    defaultPagination: { pageNum: 1, pageSize: 10 },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('初始状态', () => {
    it('默认列表为空', () => {
      const crud = useCrud(defaultOptions)
      expect(crud.list.value).toEqual([])
      expect(crud.loading.value).toBe(false)
    })

    it('默认分页参数正确', () => {
      const crud = useCrud(defaultOptions)
      expect(crud.pagination.pageNum).toBe(1)
      expect(crud.pagination.pageSize).toBe(10)
      expect(crud.pagination.total).toBe(0)
    })

    it('对话框默认关闭', () => {
      const crud = useCrud(defaultOptions)
      expect(crud.dialogVisible.value).toBe(false)
      expect(crud.isEdit.value).toBe(false)
    })

    it('表单默认为 defaultForm', () => {
      const crud = useCrud(defaultOptions)
      expect(crud.form.name).toBe('')
      expect(crud.form.status).toBe(1)
    })
  })

  describe('fetchData', () => {
    it('成功获取列表数据', async () => {
      const mockData: ApiResponse<PaginatedData<TestEntity>> = {
        code: 0,
        data: {
          rows: [{ id: 1, name: 'test', status: 1 }],
          total: 1,
        },
      }
      vi.mocked(mockApi.list).mockResolvedValue(mockData)

      const crud = useCrud(defaultOptions)
      await crud.fetchData()

      expect(crud.list.value).toEqual([{ id: 1, name: 'test', status: 1 }])
      expect(crud.pagination.total).toBe(1)
      expect(crud.loading.value).toBe(false)
    })

    it('列表请求失败时列表为空', async () => {
      vi.mocked(mockApi.list).mockRejectedValue(new Error('网络错误'))

      const crud = useCrud(defaultOptions)
      await crud.fetchData()

      expect(crud.list.value).toEqual([])
      expect(crud.loading.value).toBe(false)
    })
  })

  describe('onQuery', () => {
    it('更新分页参数并重新查询', async () => {
      vi.mocked(mockApi.list).mockResolvedValue({
        code: 0,
        data: { rows: [], total: 0 },
      })

      const crud = useCrud(defaultOptions)
      crud.onQuery({
        pagination: { pageNum: 2, pageSize: 20 },
        searchParams: { name: 'test' },
      })

      expect(crud.pagination.pageNum).toBe(2)
      expect(crud.pagination.pageSize).toBe(20)
    })
  })

  describe('resetSearch', () => {
    it('重置搜索参数并重新查询', () => {
      const crud = useCrud({ ...defaultOptions, defaultSearchParams: { name: '' } })
      crud.pagination.pageNum = 3
      crud.resetSearch()

      expect(crud.pagination.pageNum).toBe(1)
    })
  })

  describe('handleSelectionChange', () => {
    it('更新选中行', () => {
      const crud = useCrud(defaultOptions)
      const rows = [{ id: 1, name: 'test', status: 1 }]
      crud.handleSelectionChange(rows)

      expect(crud.selectedRows.value).toEqual(rows)
      expect(crud.selectedIds.value).toEqual([1])
    })
  })

  describe('openCreate', () => {
    it('打开创建对话框', () => {
      const crud = useCrud(defaultOptions)
      crud.openCreate()

      expect(crud.dialogVisible.value).toBe(true)
      expect(crud.isEdit.value).toBe(false)
    })

    it('重置表单为默认值', () => {
      const crud = useCrud(defaultOptions)
      crud.form.name = '已修改'
      crud.openCreate()

      expect(crud.form.name).toBe('')
    })
  })

  describe('openEdit', () => {
    it('打开编辑对话框', async () => {
      const crud = useCrud(defaultOptions)
      const row = { id: 1, name: '编辑项', status: 1 }
      await crud.openEdit(row)

      expect(crud.dialogVisible.value).toBe(true)
      expect(crud.isEdit.value).toBe(true)
      expect(crud.form.name).toBe('编辑项')
    })
  })

  describe('handleSubmit', () => {
    it('创建模式调用 create API', async () => {
      vi.mocked(mockApi.create).mockResolvedValue({
        code: 0,
        data: { id: 1, name: 'new', status: 1 },
      })
      vi.mocked(mockApi.list).mockResolvedValue({
        code: 0,
        data: { rows: [], total: 0 },
      })

      const crud = useCrud(defaultOptions)
      crud.openCreate()
      crud.form.name = 'new'
      await crud.handleSubmit()

      expect(mockApi.create).toHaveBeenCalledWith({ name: 'new', status: 1, id: 0 })
      expect(crud.dialogVisible.value).toBe(false)
    })

    it('编辑模式调用 update API', async () => {
      vi.mocked(mockApi.update).mockResolvedValue({
        code: 0,
        data: { id: 1, name: 'updated', status: 1 },
      })
      vi.mocked(mockApi.list).mockResolvedValue({
        code: 0,
        data: { rows: [], total: 0 },
      })

      const crud = useCrud(defaultOptions)
      await crud.openEdit({ id: 1, name: 'old', status: 1 })
      crud.form.name = 'updated'
      await crud.handleSubmit()

      expect(mockApi.update).toHaveBeenCalledWith(1, {
        name: 'updated',
        status: 1,
        id: 1,
      })
    })

    it('提交失败时不关闭对话框', async () => {
      vi.mocked(mockApi.create).mockRejectedValue(new Error('创建失败'))

      const crud = useCrud(defaultOptions)
      crud.openCreate()
      await crud.handleSubmit()

      expect(crud.dialogVisible.value).toBe(true)
    })
  })

  describe('handleDelete', () => {
    it('删除确认后调用 delete API', async () => {
      const { ElMessageBox } = await import('element-plus')
      vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
      vi.mocked(mockApi.delete).mockResolvedValue({
        code: 0,
        data: null,
      })
      vi.mocked(mockApi.list).mockResolvedValue({
        code: 0,
        data: { rows: [], total: 0 },
      })

      const crud = useCrud(defaultOptions)
      await crud.handleDelete({ id: 1, name: 'test', status: 1 })

      expect(mockApi.delete).toHaveBeenCalledWith(1)
    })
  })

  describe('handleBatchDelete', () => {
    it('批量删除', async () => {
      const { ElMessageBox } = await import('element-plus')
      vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
      vi.mocked(mockApi.batchDelete!).mockResolvedValue({
        code: 0,
        data: null,
      })
      vi.mocked(mockApi.list).mockResolvedValue({
        code: 0,
        data: { rows: [], total: 0 },
      })

      const crud = useCrud(defaultOptions)
      crud.selectedIds.value = [1, 2, 3]
      await crud.handleBatchDelete()

      expect(mockApi.batchDelete).toHaveBeenCalledWith([1, 2, 3])
    })

    it('无选中项时不执行', async () => {
      const crud = useCrud(defaultOptions)
      crud.selectedIds.value = []
      await crud.handleBatchDelete()

      expect(mockApi.batchDelete).not.toHaveBeenCalled()
    })
  })

  describe('refresh', () => {
    it('刷新列表', async () => {
      vi.mocked(mockApi.list).mockResolvedValue({
        code: 0,
        data: { rows: [], total: 0 },
      })

      const crud = useCrud(defaultOptions)
      crud.refresh()

      expect(mockApi.list).toHaveBeenCalled()
    })
  })

  describe('closeDialog', () => {
    it('关闭对话框', () => {
      const crud = useCrud(defaultOptions)
      crud.openCreate()
      expect(crud.dialogVisible.value).toBe(true)

      crud.closeDialog()
      expect(crud.dialogVisible.value).toBe(false)
    })
  })

  describe('hasSelection', () => {
    it('有选中项时返回 true', () => {
      const crud = useCrud(defaultOptions)
      crud.handleSelectionChange([{ id: 1, name: 'test', status: 1 }])

      expect(crud.hasSelection.value).toBe(true)
    })

    it('无选中项时返回 false', () => {
      const crud = useCrud(defaultOptions)
      expect(crud.hasSelection.value).toBe(false)
    })
  })
})
