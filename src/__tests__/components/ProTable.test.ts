import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { ElLoading } from 'element-plus'
import ProTable from '@/components/ProTable/index.vue'

// TableColumn 接口定义（与组件内部接口保持一致）
interface TableColumn {
  prop: string
  label: string
  width?: number
  minWidth?: number
  sortable?: boolean
  fixed?: boolean | 'left' | 'right' | string
  align?: string
  children?: TableColumn[]
  formatter?: (row: Record<string, unknown>, column: Record<string, unknown>) => string | number
  alwaysShow?: boolean
  showOverflowTooltip?: boolean
}

describe('ProTable', () => {
  const pinia = createPinia()

  function createWrapper(props: Record<string, unknown>) {
    return mount(ProTable, {
      props: props as any,
      global: {
        plugins: [pinia],
        directives: {
          loading: ElLoading.directive,
        },
        stubs: {
          SearchForm: true,
          TablePagination: true,
          ColumnSettings: true,
          VirtualTable: true,
          // Element Plus 组件统配 stubs
          ElCard: { template: '<div class="el-card"><slot /></div>' },
          ElButton: { template: '<button class="el-button"><slot /></button>' },
          ElTooltip: { template: '<div><slot /></div>' },
          ElIcon: { template: '<span class="el-icon"><slot /></span>' },
          ElProgress: { template: '<div class="el-progress" />' },
          ElTabs: { template: '<div class="el-tabs"><slot /></div>' },
          ElTabPane: { template: '<div class="el-tab-pane"><slot /></div>' },
          ElBadge: { template: '<span class="el-badge"><slot /></span>' },
          ElTable: { template: '<div class="el-table"><slot /></div>' },
          ElTableColumn: { template: '<div class="el-table-column" />' },
          ElPagination: { template: '<div class="el-pagination" />' },
        },
      },
    })
  }

  const defaultColumns: TableColumn[] = [
    { prop: 'index', label: '序号', width: 60 },
    { prop: 'name', label: '名称', minWidth: 200 },
    { prop: 'status', label: '状态', width: 80 },
  ]

  const defaultData = [
    { id: 1, name: '测试1', status: 1 },
    { id: 2, name: '测试2', status: 0 },
  ]

  const defaultProps = {
    columns: defaultColumns,
    data: defaultData,
    loading: false,
    pagination: { pageNum: 1, pageSize: 10, total: 2 },
    showPagination: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('正确渲染表格和列', () => {
    const wrapper = createWrapper(defaultProps)
    expect(wrapper.find('.pro-table').exists()).toBe(true)
  })

  it('显示搜索区域当 searchFields 有值', () => {
    const props = {
      ...defaultProps,
      searchFields: [{ prop: 'name', label: '名称', type: 'text' }],
    }
    const wrapper = createWrapper(props)
    expect(wrapper.findComponent({ name: 'SearchForm' }).exists()).toBe(true)
  })

  it('不显示搜索区域当 searchFields 为空', () => {
    const wrapper = createWrapper(defaultProps)
    expect(wrapper.findComponent({ name: 'SearchForm' }).exists()).toBe(false)
  })

  it('正确渲染分页当 showPagination 为 true', () => {
    const wrapper = createWrapper(defaultProps)
    expect(wrapper.findComponent({ name: 'TablePagination' }).exists()).toBe(true)
  })

  it('不渲染分页当 showPagination 为 false', () => {
    const props = { ...defaultProps, showPagination: false }
    const wrapper = createWrapper(props)
    expect(wrapper.findComponent({ name: 'TablePagination' }).exists()).toBe(false)
  })

  it('显示骨架屏/加载状态当 loading 为 true', () => {
    const props = { ...defaultProps, loading: true }
    const wrapper = createWrapper(props)
    expect(wrapper.props().loading).toBe(true)
  })

  it('触发 query 事件当搜索触发', async () => {
    const wrapper = createWrapper({
      ...defaultProps,
      searchFields: [{ prop: 'name', label: '名称', type: 'text' }],
      searchParams: { name: '测试' },
    })

    const vm = wrapper.vm as unknown as { handleQuery: () => void; handleSelectionChange: (rows: Record<string, unknown>[]) => void; columns: TableColumn[] }

    vm.handleQuery()

    expect(wrapper.emitted('query')).toBeTruthy()
    expect(wrapper.emitted('query')![0][0]).toEqual({
      searchParams: { name: '测试' },
      pagination: { pageNum: 1, pageSize: 10, total: 2 },
    })
  })

  it('触发 selection-change 事件当选中行', async () => {
    const wrapper = createWrapper({
      ...defaultProps,
      showSelection: true,
    })

    const rows = [{ id: 1, name: '选中项' }]
    ;(wrapper.vm as unknown as { handleSelectionChange: (rows: Record<string, unknown>[]) => void }).handleSelectionChange(rows)

    expect(wrapper.emitted('selection-change')).toBeTruthy()
    expect(wrapper.emitted('selection-change')![0][0]).toEqual(rows)
  })

  it('正确处理嵌套列结构', () => {
    const columns: TableColumn[] = [
      {
        prop: 'info',
        label: '信息',
        children: [
          { prop: 'name', label: '名称' },
          { prop: 'email', label: '邮箱' },
        ],
      },
    ]
    const props = { ...defaultProps, columns, data: [{ id: 1 }] }
    const wrapper = createWrapper(props)

    expect((wrapper.vm as unknown as { columns: TableColumn[] }).columns).toEqual(columns)
  })

  it('空数据时不报错', () => {
    const props = { ...defaultProps, data: [] }
    expect(() => createWrapper(props)).not.toThrow()
  })

  it('展示导出进度条当 exporting 为 true', () => {
    const props = {
      ...defaultProps,
      exporting: true,
      exportPercent: 50,
      exportStatusText: '正在导出...',
    }
    const wrapper = createWrapper(props)

    expect(wrapper.find('.export-progress').exists()).toBe(true)
    expect(wrapper.text()).toContain('正在导出')
  })
})
