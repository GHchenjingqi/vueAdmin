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
    getModelOptions: vi.fn(),
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
  props: [
    'modelValue',
    'steps',
    'characterAnchor',
    'platforms',
    'max',
    'filterable',
    'allowCreate',
    'defaultFirstOption',
    'placeholder',
    'remote',
    'loading',
    'remoteMethod',
    'clearable',
  ],
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
      },
    },
  })

const vm = (wrapper: ReturnType<typeof mountPage>) => wrapper.vm as unknown as Record<string, any>

describe('PublishPrompt.vue 模型字段可下拉+手输', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    routeParams.id = ''
    stableRoute.params.id = ''
    mocks.portalApi.getCategories.mockResolvedValue({ data: [{ id: 1, name: '人物' }] })
    mocks.portalApi.getPlatforms.mockResolvedValue({ data: [{ id: 2, name: '通用' }] })
    mocks.portalApi.getModelOptions.mockResolvedValue({ data: ['Midjourney', 'Stable Diffusion'] })
    mocks.portalApi.getParentOptions.mockResolvedValue({ data: [{ id: 5, title: '原始提示词' }] })
    mocks.portalApi.createMine.mockResolvedValue({ data: { id: 1 } })
    mocks.portalApi.updateMine.mockResolvedValue({ data: { id: 1 } })
  })

  it('1. 加载后模型选项来自公开接口，且模型字段渲染为可搜索下拉（filterable + allow-create）', async () => {
    const wrapper = mountPage()
    await nextTick()
    await flushPromises()
    await nextTick()
    const state = vm(wrapper)
    expect(state.modelOptions).toEqual(['Midjourney', 'Stable Diffusion'])
    // 表单内三个下拉：关联原提示词 / 分类 / 模型，模型是最后一个
    const selects = wrapper.findAllComponents({ name: 'ElSelect' })
    const select = selects[selects.length - 1]
    expect(select).toBeDefined()
    // stub 组件对无值布尔属性接收为空字符串，只断言属性已传入即可
    expect('filterable' in select.props()).toBe(true)
    expect('allowCreate' in select.props()).toBe(true)
    expect('defaultFirstOption' in select.props()).toBe(true)
  })

  it('2. 手动录入新模型后提交，payload 携带手输的值', async () => {
    const wrapper = mountPage()
    await nextTick()
    await flushPromises()
    await nextTick()
    const state = vm(wrapper)
    state.form.title = '标题'
    state.form.content = '正文'
    state.form.categoryId = 1
    state.form.modelName = '自研模型 X'
    state.form.platformGroups = [{ platformId: 2, images: [{ url: '/uploads/a.png', filePath: 'f1', sort: 0, isCover: true }] }]
    await state.handleSubmit(false)
    expect(mocks.portalApi.createMine).toHaveBeenCalledTimes(1)
    const payload = mocks.portalApi.createMine.mock.calls[0][0]
    expect(payload.modelName).toBe('自研模型 X')
  })

  it('3. 编辑时若当前模型不在选项列表中，补进列表保证回显', async () => {
    routeParams.id = '9'
    stableRoute.params.id = '9'
    mocks.portalApi.getMinePrompt.mockResolvedValue({
      data: {
        id: 9,
        title: '旧投稿',
        content: '正文',
        categoryId: 1,
        modelName: '冷门模型',
        type: 'single',
        characterAnchor: '',
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
    expect(state.form.modelName).toBe('冷门模型')
    expect(state.modelOptions).toContain('冷门模型')
    expect(state.modelOptions[0]).toBe('冷门模型')
  })

  it('4. 模型选项接口失败时仍能手动录入，不阻断表单加载', async () => {
    mocks.portalApi.getModelOptions.mockRejectedValue(new Error('network'))
    const wrapper = mountPage()
    await nextTick()
    await flushPromises()
    await nextTick()
    const state = vm(wrapper)
    expect(state.modelOptions).toEqual([])
    expect(state.loading).toBe(false)
    // 表单其余字段正常加载
    expect(state.categories).toHaveLength(1)
    expect(state.platforms).toHaveLength(1)
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
    state.form.modelName = 'MJ'
    state.form.parentId = 5
    state.form.platformGroups = [{ platformId: 2, images: [{ url: '/uploads/a.png', filePath: 'f1', sort: 0, isCover: true }] }]
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
    // 后端列表未返回原关联项时补上，保证下拉可读
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
})
