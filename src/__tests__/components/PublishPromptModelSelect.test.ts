import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

/** 全部接口用 mock，测试不读写任何数据库 */
const mocks = vi.hoisted(() => ({
  portalApi: {
    getCategories: vi.fn(),
    getPlatforms: vi.fn(),
    getParentOptions: vi.fn(),
    getMinePrompt: vi.fn(),
    createMine: vi.fn(),
    updateMine: vi.fn(),
  },
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/api', () => ({ portalApi: mocks.portalApi }))
vi.mock('@/utils/error', () => ({ getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)) }))
vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, ElMessage: mocks.message }
})

// 路由 / userStore 用轻量 mock，避免 Pinia/router 初始化噪声
vi.mock('@/stores', () => ({ useUserStore: () => ({ isLoggedIn: true }) }))

const routeParams = vi.hoisted(() => ({ id: '' }))
const stableRoute = vi.hoisted(() => ({ params: { id: '' }, fullPath: '/portal/publish' }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    useRoute: () => stableRoute,
    useRouter: () => ({ push: vi.fn() }),
  }
})

import PublishPrompt from '@/views/portal/PublishPrompt.vue'

const stubComponent = (name?: string) => ({
  name,
  props: ['modelValue', 'steps', 'characterAnchor', 'platforms', 'max', 'filterable', 'remote', 'loading', 'remoteMethod', 'clearable'],
  template: '<div class="stub"><slot /></div>',
  methods: { validate: () => Promise.resolve(true) },
})

const mountPage = () =>
  mount(PublishPrompt, {
    global: {
      directives: { loading: {} },
      stubs: {
        PlatformImageGroups: stubComponent('PlatformImageGroups'),
        SequenceStepEditor: stubComponent('SequenceStepEditor'),
        'el-form': { name: 'ElForm', template: '<form><slot /></form>', methods: { validate: () => Promise.resolve(true) } },
        'el-form-item': stubComponent(),
        'el-radio-group': stubComponent(),
        'el-radio-button': stubComponent(),
        'el-input': stubComponent(),
        'el-select': stubComponent('ElSelect'),
        'el-option': stubComponent(),
        'el-button': stubComponent(),
        'el-tag': { template: '<span class="model-tag"><slot /></span>' },
      },
    },
  })

const vm = (wrapper: ReturnType<typeof mountPage>) => wrapper.vm as unknown as Record<string, any>

const platforms = [
  { id: 2, name: '即梦' },
  { id: 4, name: 'GPT' },
  { id: 9, name: '混元' },
]

describe('PublishPrompt.vue 模型由效果图平台组联动派生', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    routeParams.id = ''
    stableRoute.params.id = ''
    mocks.portalApi.getCategories.mockResolvedValue({ data: [{ id: 1, name: '人物' }] })
    mocks.portalApi.getPlatforms.mockResolvedValue({ data: platforms })
    mocks.portalApi.getParentOptions.mockResolvedValue({ data: [{ id: 5, title: '原始提示词' }] })
    mocks.portalApi.createMine.mockResolvedValue({ data: { id: 1 } })
    mocks.portalApi.updateMine.mockResolvedValue({ data: { id: 1 } })
  })

  it('1. 右侧新增平台组后，左侧模型集合与 form.modelName 同步（去重、按平台组顺序）', async () => {
    const wrapper = mountPage()
    await nextTick()
    await flushPromises()
    await nextTick()
    const state = vm(wrapper)

    state.form.platformGroups = [
      { platformId: 2, images: [] },
      { platformId: 4, images: [] },
      { platformId: 2, images: [] },
    ]
    await nextTick()
    expect(state.derivedModelNames).toEqual(['即梦', 'GPT'])
    expect(state.form.modelName).toBe('即梦 / GPT')
  })

  it('2. 提交时 payload.modelName 为平台名集合，忽略手填旧值', async () => {
    const wrapper = mountPage()
    await nextTick()
    await flushPromises()
    await nextTick()
    const state = vm(wrapper)
    state.form.title = '标题'
    state.form.content = '正文'
    state.form.categoryId = 1
    state.form.modelName = '手填旧值'
    state.form.platformGroups = [
      { platformId: 4, images: [{ url: '/uploads/a.png', filePath: 'f1', sort: 0, isCover: true }] },
      { platformId: 9, images: [] },
    ]
    await nextTick()
    await state.handleSubmit(false)
    const payload = mocks.portalApi.createMine.mock.calls[0][0]
    expect(payload.modelName).toBe('GPT / 混元')
  })

  it('3. 编辑时左侧模型由平台组派生，不取存档的 modelName', async () => {
    stableRoute.params.id = '9'
    mocks.portalApi.getMinePrompt.mockResolvedValue({
      data: {
        id: 9,
        title: '旧投稿',
        content: '正文',
        categoryId: 1,
        modelName: '过时模型',
        type: 'single',
        characterAnchor: '',
        steps: [],
        platformGroups: [{ platformId: 9, images: [{ url: '/uploads/a.png', filePath: 'f1', sort: 0, isCover: true }] }],
        images: [],
      },
    })
    const wrapper = mountPage()
    await nextTick()
    await flushPromises()
    await nextTick()
    const state = vm(wrapper)
    expect(state.derivedModelNames).toEqual(['混元'])
    expect(state.form.modelName).toBe('混元')
  })

  it('4. 套组模式的模型来自所有步骤的平台组，跨步骤去重', async () => {
    const wrapper = mountPage()
    await nextTick()
    await flushPromises()
    await nextTick()
    const state = vm(wrapper)
    state.form.type = 'sequence'
    state.form.steps = [
      { name: '步骤1', platformGroups: [{ platformId: 2, images: [] }] },
      { name: '步骤2', platformGroups: [{ platformId: 2, images: [] }, { platformId: 9, images: [] }] },
    ]
    await nextTick()
    expect(state.derivedModelNames).toEqual(['即梦', '混元'])
    expect(state.form.modelName).toBe('即梦 / 混元')
  })

  it('5. 新增时加载可关联的已发布提示词，关联下拉为可搜索远程下拉', async () => {
    const wrapper = mountPage()
    await nextTick()
    await flushPromises()
    await nextTick()
    const state = vm(wrapper)
    expect(state.parentOptions).toEqual([{ id: 5, title: '原始提示词' }])
    expect(mocks.portalApi.getParentOptions).toHaveBeenCalledWith({ keyword: '', excludeId: undefined })
    const parentSelect = wrapper.findAllComponents({ name: 'ElSelect' })[0]
    expect('remote' in parentSelect.props()).toBe(true)
    expect('filterable' in parentSelect.props()).toBe(true)
  })

  it('6. 选择原提示词后提交，payload 携带 parentId', async () => {
    const wrapper = mountPage()
    await nextTick()
    await flushPromises()
    await nextTick()
    const state = vm(wrapper)
    state.form.title = '追问'
    state.form.content = '追问正文'
    state.form.categoryId = 1
    state.form.parentId = 5
    state.form.platformGroups = [{ platformId: 2, images: [{ url: '/uploads/a.png', filePath: 'f1', sort: 0, isCover: true }] }]
    await nextTick()
    await state.handleSubmit(false)
    const payload = mocks.portalApi.createMine.mock.calls[0][0]
    expect(payload.parentId).toBe(5)
  })

  it('7. 编辑时回显原关联提示词、排除自身，且原关联项不在列表中时补回', async () => {
    stableRoute.params.id = '9'
    mocks.portalApi.getParentOptions.mockResolvedValue({ data: [{ id: 6, title: '另一条已发布' }] })
    mocks.portalApi.getMinePrompt.mockResolvedValue({
      data: {
        id: 9,
        title: '追问投稿',
        content: '正文',
        categoryId: 1,
        modelName: 'MJ',
        parentId: 5,
        parentTitle: '原始提示词',
        type: 'single',
        steps: [],
        platformGroups: [],
        images: [],
      },
    })
    const wrapper = mountPage()
    await nextTick()
    await flushPromises()
    await nextTick()
    const state = vm(wrapper)
    expect(state.form.parentId).toBe(5)
    expect(mocks.portalApi.getParentOptions).toHaveBeenCalledWith({ keyword: '', excludeId: 9 })
    expect(state.parentOptions).toEqual(expect.arrayContaining([{ id: 5, title: '原始提示词' }]))
  })

  it('8. 关联选项接口失败时不影响表单其他字段加载', async () => {
    mocks.portalApi.getParentOptions.mockRejectedValue(new Error('network'))
    const wrapper = mountPage()
    await nextTick()
    await flushPromises()
    await nextTick()
    const state = vm(wrapper)
    expect(state.parentOptions).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.categories).toHaveLength(1)
  })

  it('9. 单条模式的效果图平台组使用 tab 布局（与后台一致）', async () => {
    const wrapper = mountPage()
    await nextTick()
    await flushPromises()
    await nextTick()
    const groups = wrapper.findComponent({ name: 'PlatformImageGroups' })
    expect(groups.exists()).toBe(true)
    // stub 未声明 layout prop，会落到 attrs 上
    expect(groups.attributes('layout')).toBe('tabs')
  })
})
