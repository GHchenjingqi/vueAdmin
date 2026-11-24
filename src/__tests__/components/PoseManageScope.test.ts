import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  promptApi: {
    getPrompts: vi.fn(),
    getCategoryOptions: vi.fn(),
    getPlatformOptions: vi.fn(),
    getParentOptions: vi.fn(),
    getStats: vi.fn(),
  },
  message: { error: vi.fn() },
}))

vi.mock('@/api', () => ({ promptApi: mocks.promptApi }))
vi.mock('@/utils/error', () => ({ getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)) }))
vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, ElMessage: mocks.message, ElMessageBox: { confirm: vi.fn() } }
})

import PromptManage from '@/views/prompt/PromptManage.vue'

const stubComponent = (name?: string) => ({
  name,
  props: ['modelValue', 'title', 'columns', 'data', 'loading', 'columnSettingsKey', 'searchFields', 'searchParams', 'showSelection', 'reserveSelection', 'rowKey', 'showPagination', 'pagination'],
  template: '<div class="stub"><slot /><slot name="header-buttons" /></div>',
})

const mountPage = (pose = false) =>
  mount(PromptManage, {
    props: { pose },
    global: {
      stubs: {
        ProTable: stubComponent('ProTable'),
        ProForm: { template: '<div class="stub"><slot /></div>', methods: { validate: () => Promise.resolve(true) } },
        PlatformImageGroups: stubComponent(),
        SequenceStepEditor: stubComponent(),
        'el-row': stubComponent(),
        'el-col': stubComponent(),
        'el-card': stubComponent(),
        'el-dialog': stubComponent(),
        'el-button': stubComponent(),
        'el-tag': stubComponent(),
        'el-image': stubComponent(),
        'el-select': stubComponent(),
        'el-option': stubComponent(),
        'el-radio-group': stubComponent(),
        'el-radio-button': stubComponent(),
        'el-form-item': stubComponent(),
      },
    },
  })

describe('后台提示词管理 / 姿势管理 数据隔离', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mocks.promptApi.getPrompts.mockResolvedValue({ data: { rows: [], total: 0 } })
    mocks.promptApi.getCategoryOptions.mockResolvedValue({ data: [] })
    mocks.promptApi.getPlatformOptions.mockResolvedValue({ data: [] })
    mocks.promptApi.getParentOptions.mockResolvedValue({ data: [] })
    mocks.promptApi.getStats.mockResolvedValue({ data: {} })
  })

  it('1. 普通提示词管理：所有查询都不带 pose scope', async () => {
    mountPage()
    await flushPromises()
    expect(mocks.promptApi.getPrompts.mock.calls[0][0]).not.toHaveProperty('scope')
    expect(mocks.promptApi.getCategoryOptions).toHaveBeenCalledWith({})
    expect(mocks.promptApi.getStats).toHaveBeenCalledWith({})
    expect(mocks.promptApi.getParentOptions).not.toHaveBeenCalled()
  })

  it('2. 姿势管理：列表/分类/统计/关联项查询都带 pose scope，且标题为姿势提示词管理', async () => {
    const wrapper = mountPage(true)
    await flushPromises()
    expect(mocks.promptApi.getPrompts.mock.calls[0][0].scope).toBe('pose')
    expect(mocks.promptApi.getCategoryOptions).toHaveBeenCalledWith({ scope: 'pose' })
    expect(mocks.promptApi.getStats).toHaveBeenCalledWith({ scope: 'pose' })
    expect(wrapper.findComponent({ name: 'ProTable' }).props('title')).toBe('姿势提示词管理')
    await (wrapper.vm as unknown as { openDialog: () => Promise<void> }).openDialog()
    await flushPromises()
    expect(mocks.promptApi.getParentOptions.mock.calls[0][0].scope).toBe('pose')
  })
})
