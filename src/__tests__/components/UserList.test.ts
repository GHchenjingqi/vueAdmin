import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const mocks = vi.hoisted(() => {
  const mockUserApi = {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    batchDelete: vi.fn(),
    changePassword: vi.fn(),
  }

  const mockDeptApi = {
    list: vi.fn(),
  }

  const mockRoleApi = {
    list: vi.fn(),
  }

  return { mockUserApi, mockDeptApi, mockRoleApi }
})

vi.mock('@/api', () => ({
  userApi: mocks.mockUserApi,
  deptApi: mocks.mockDeptApi,
  roleApi: mocks.mockRoleApi,
}))

vi.mock('@/utils/request', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/utils/error', () => ({
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : 'Unknown error')),
}))

vi.mock('@/utils/download', () => ({
  downloadBlob: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
    },
    ElMessageBox: {
      confirm: vi.fn().mockResolvedValue('confirm'),
    },
  }
})

import UserList from '@/views/UserList.vue'

describe('UserList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())

    mocks.mockUserApi.list.mockResolvedValue({
      data: { rows: [], total: 0 },
    })
    mocks.mockDeptApi.list.mockResolvedValue({
      data: { rows: [] },
    })
    mocks.mockRoleApi.list.mockResolvedValue({
      data: { rows: [] },
    })
  })

  function createWrapper() {
    return mount(UserList, {
      global: {
        stubs: {
          ProTable: {
            template: `<div class="pro-table">
              <div class="pro-table-header"><slot name="header-buttons" /></div>
              <div class="pro-table-body"><slot /></div>
              <slot name="column-username" :row="{}" />
              <slot name="column-nickname" :row="{}" />
              <slot name="column-dept" :row="{}" />
              <slot name="column-roles" :row="{}" />
              <slot name="column-status" :row="{}" />
              <slot name="column-createdAt" :row="{}" />
              <slot name="column-actions" :row="{}" />
            </div>`,
            props: [
              'title',
              'columns',
              'searchFields',
              'data',
              'loading',
              'showPagination',
              'pagination',
              'searchParams',
              'columnSettingsKey',
              'showSelection',
            ],
          },
          UserFormDialog: {
            template: '<div class="user-form-dialog" />',
            props: ['modelValue', 'isEdit', 'row'],
          },
          UserImportDialog: {
            template: '<div class="user-import-dialog" />',
            props: ['modelValue'],
          },
          'el-button': {
            template: '<button class="el-button" :type="type" :disabled="disabled"><slot /></button>',
            props: ['type', 'icon', 'disabled', 'link', 'size'],
          },
          'el-icon': { template: '<span class="el-icon"><slot /></span>' },
          'el-tag': {
            template: '<span class="el-tag" :type="type"><slot /></span>',
            props: ['type', 'size'],
          },
          'el-dropdown': {
            template: '<div class="el-dropdown"><slot /><slot name="dropdown" /></div>',
            props: ['trigger', 'command'],
          },
          'el-dropdown-menu': { template: '<div class="el-dropdown-menu"><slot /></div>' },
          'el-dropdown-item': {
            template: '<div class="el-dropdown-item" :command="command"><slot /></div>',
            props: ['command', 'icon', 'divided'],
          },
        },
      },
    })
  }

  it('渲染用户列表页面', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.page-container').exists()).toBe(true)
  })

  it('渲染 ProTable 组件', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.pro-table').exists()).toBe(true)
  })

  it('显示新增用户按钮', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    const buttons = wrapper.findAll('.el-button')
    const addBtn = buttons.find((b) => b.text().includes('addUser') || b.text().includes('添加') || b.text().includes('新增'))
    expect(addBtn).toBeTruthy()
  })

  it('显示批量删除按钮', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    const buttons = wrapper.findAll('.el-button')
    const batchBtn = buttons.find((b) => b.text().includes('batchDelete') || b.text().includes('批量删除'))
    expect(batchBtn).toBeTruthy()
  })

  it('显示导出按钮', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    const buttons = wrapper.findAll('.el-button')
    const exportBtn = buttons.find((b) => b.text().includes('export') || b.text().includes('导出'))
    expect(exportBtn).toBeTruthy()
  })

  it('显示导入按钮', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    const buttons = wrapper.findAll('.el-button')
    const importBtn = buttons.find((b) => b.text().includes('import') || b.text().includes('导入'))
    expect(importBtn).toBeTruthy()
  })

  it('挂载时调用 fetchUsers', async () => {
    createWrapper()
    await nextTick()
    await nextTick()

    expect(mocks.mockUserApi.list).toHaveBeenCalled()
  })

  it('挂载时获取部门列表', async () => {
    createWrapper()
    await nextTick()
    await nextTick()

    expect(mocks.mockDeptApi.list).toHaveBeenCalled()
  })
})
