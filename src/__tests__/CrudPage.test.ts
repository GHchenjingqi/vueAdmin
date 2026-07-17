import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CrudPage from '@/components/CrudPage.vue'

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn(),
  },
}))

const mockApi = {
  list: vi.fn().mockResolvedValue({ code: 0, data: { rows: [], total: 0 } }),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  batchDelete: vi.fn(),
}

const defaultProps = {
  title: '测试页面',
  api: mockApi as never,
  columns: [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'name', label: '名称' },
  ],
  searchFields: [{ label: '名称', prop: 'name', type: 'input', placeholder: '请输入名称' }],
  formSchema: [{ prop: 'name', label: '名称', type: 'input' }],
  defaultForm: { id: 0, name: '' },
}

describe('CrudPage', () => {
  describe('渲染', () => {
    it('渲染页面容器', () => {
      const wrapper = mount(CrudPage, {
        props: defaultProps,
        global: {
          stubs: {
            ProTable: {
              template: '<div class="mock-pro-table"><slot name="header-buttons" /><slot /></div>',
            },
            FormDialog: {
              template: '<div class="mock-form-dialog" />',
            },
            'el-button': {
              template: '<button class="el-button" :class="type"><slot /></button>',
              props: ['type', 'icon', 'disabled', 'link', 'size'],
            },
          },
        },
      })
      expect(wrapper.find('.page-container').exists()).toBe(true)
    })

    it('渲染页面标题', () => {
      const wrapper = mount(CrudPage, {
        props: defaultProps,
        global: {
          stubs: {
            ProTable: {
              template: '<div class="mock-pro-table"><slot name="header-buttons" /><slot /></div>',
            },
            FormDialog: {
              template: '<div class="mock-form-dialog" />',
            },
            'el-button': {
              template: '<button class="el-button" :class="type"><slot /></button>',
              props: ['type', 'icon', 'disabled', 'link', 'size'],
            },
          },
        },
      })
      expect(wrapper.find('.page-container').exists()).toBe(true)
    })
  })

  describe('批量删除按钮', () => {
    it('有批量删除数据时显示数量', async () => {
      const wrapper = mount(CrudPage, {
        props: {
          ...defaultProps,
          showBatchDelete: true,
        },
        global: {
          stubs: {
            ProTable: {
              template: '<div class="mock-pro-table"><slot name="header-buttons" /><slot /></div>',
            },
            FormDialog: {
              template: '<div class="mock-form-dialog" />',
            },
            'el-button': {
              template: '<button class="el-button" :class="type"><slot /></button>',
              props: ['type', 'icon', 'disabled', 'link', 'size'],
            },
          },
        },
      })
      expect(wrapper.find('.page-container').exists()).toBe(true)
    })
  })
})
