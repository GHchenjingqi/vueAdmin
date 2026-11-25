import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  promptApi: {
    getPrompts: vi.fn(),
    getCategoryOptions: vi.fn(),
    getPlatformOptions: vi.fn(),
    getParentOptions: vi.fn(),
    getRelatedOptions: vi.fn(),
    getStats: vi.fn(),
    getCategories: vi.fn(),
    updateCategory: vi.fn(),
  },
  message: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/api', () => ({ promptApi: mocks.promptApi }))
vi.mock('@/api/prompt', () => ({ promptApi: mocks.promptApi }))
vi.mock('@/utils/error', () => ({ getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)) }))
vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, ElMessage: mocks.message, ElMessageBox: { confirm: vi.fn() } }
})

import PromptManage from '@/views/prompt/PromptManage.vue'
import PromptCategory from '@/views/prompt/PromptCategory.vue'

const stubComponent = (name?: string) => ({
  name,
  props: [
    'modelValue',
    'title',
    'columns',
    'data',
    'loading',
    'columnSettingsKey',
    'searchFields',
    'searchParams',
    'showSelection',
    'reserveSelection',
    'rowKey',
    'showPagination',
    'pagination',
  ],
  template: '<div class="stub"><slot /><slot name="header-buttons" /></div>',
})

const mountManage = (mode: 'collection' | 'character') =>
  mount(PromptManage, {
    props: { mode },
    global: {
      stubs: {
        ProTable: stubComponent('ProTable'),
        ProForm: { template: '<div class="stub"><slot /></div>', methods: { validate: () => Promise.resolve(true) } },
        PlatformImageGroups: stubComponent(),
        SequenceStepEditor: stubComponent(),
        CharacterPoseEditor: stubComponent(),
        CharacterLibraryEditor: stubComponent(),
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

describe('后台专题 / 角色库管理数据隔离', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mocks.promptApi.getPrompts.mockResolvedValue({ data: { rows: [], total: 0 } })
    mocks.promptApi.getCategoryOptions.mockResolvedValue({ data: [] })
    mocks.promptApi.getPlatformOptions.mockResolvedValue({ data: [] })
    mocks.promptApi.getParentOptions.mockResolvedValue({ data: [] })
    mocks.promptApi.getRelatedOptions.mockResolvedValue({ data: [] })
    mocks.promptApi.getStats.mockResolvedValue({ data: {} })
  })

  it('1. 提示词专题管理：查询带 collection scope，标题为提示词专题管理，编辑走关联选择器', async () => {
    const wrapper = mountManage('collection')
    await flushPromises()
    expect(mocks.promptApi.getPrompts.mock.calls[0][0].scope).toBe('collection')
    expect(mocks.promptApi.getStats).toHaveBeenCalledWith({ scope: 'collection' })
    expect(wrapper.findComponent({ name: 'ProTable' }).props('title')).toBe('提示词专题管理')
    await (wrapper.vm as unknown as { openDialog: () => Promise<void> }).openDialog()
    await flushPromises()
    expect(mocks.promptApi.getRelatedOptions).toHaveBeenCalled()
    expect(mocks.promptApi.getParentOptions).not.toHaveBeenCalled()
  })

  it('2. 角色库管理：查询带 character scope，标题为角色库管理', async () => {
    const wrapper = mountManage('character')
    await flushPromises()
    expect(mocks.promptApi.getPrompts.mock.calls[0][0].scope).toBe('character')
    expect(mocks.promptApi.getStats).toHaveBeenCalledWith({ scope: 'character' })
    expect(wrapper.findComponent({ name: 'ProTable' }).props('title')).toBe('角色库管理')
  })
})

describe('分类管理：两级树与拖拽归并', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mocks.promptApi.getCategories.mockResolvedValue({
      data: {
        rows: [
          { id: 1, name: '人物', description: null, sort: 0, status: 1 },
          { id: 2, name: '服装', description: null, sort: 1, status: 1 },
          { id: 3, name: '姿势线稿', description: null, sort: 2, status: 1, parentId: 1 },
        ],
        total: 3,
      },
    })
    mocks.promptApi.updateCategory.mockResolvedValue({ data: {} })
  })

  const mountPage = () =>
    mount(PromptCategory, {
      global: {
        stubs: {
          'el-card': stubComponent(),
          'el-table': stubComponent(),
          // 列桩不渲染作用域插槽，避免插槽参数缺失导致模板报错
          'el-table-column': { template: '<div class="stub" />' },
          'el-dialog': stubComponent(),
          'el-button': stubComponent(),
          'el-tag': stubComponent(),
          'el-icon': stubComponent(),
          'el-input': stubComponent(),
          'el-select': stubComponent(),
          'el-option': stubComponent(),
          'el-form': stubComponent(),
          'el-form-item': stubComponent(),
          'el-switch': stubComponent(),
          'el-input-number': stubComponent(),
        },
      },
    })

  it('3. mergeCategory 调用 updateCategory 写入 parentId', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await (wrapper.vm as unknown as { mergeCategory: (id: number, target: number) => Promise<void> }).mergeCategory(1, 2)
    expect(mocks.promptApi.updateCategory).toHaveBeenCalledWith(1, { parentId: 2 })
    expect(mocks.message.success).toHaveBeenCalled()
  })

  it('4. 已含子分类的一级分类不允许再并入其他分类（防三级层级）', async () => {
    const wrapper = mountPage()
    await flushPromises()
    const vm = wrapper.vm as unknown as { canDropOn: (target: { id: number; parentId?: number | null }) => boolean }
    expect(vm.canDropOn({ id: 2, parentId: null })).toBe(false)
    expect(vm.canDropOn({ id: 3, parentId: 1 })).toBe(false)
  })
})
