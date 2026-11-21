import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

/** 全部接口用 mock，测试不读写任何数据库 */
const mocks = vi.hoisted(() => ({
  promptApi: {
    getPrompts: vi.fn(),
    getPrompt: vi.fn(),
    getStats: vi.fn(),
    getCategoryOptions: vi.fn(),
    getModelOptions: vi.fn(),
    getPlatformOptions: vi.fn(),
    getParentOptions: vi.fn(),
    uploadImage: vi.fn(),
    createPrompt: vi.fn(),
    updatePrompt: vi.fn(),
  },
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/api', () => ({ promptApi: mocks.promptApi }))
vi.mock('@/utils/error', () => ({ getErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)) }))
vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, ElMessage: mocks.message, ElMessageBox: { confirm: vi.fn() } }
})

import PromptManage from '@/views/prompt/PromptManage.vue'

const stubComponent = (extra = '', name?: string) => ({
  name,
  props: ['modelValue', 'platforms', 'max', 'uploader', 'steps', 'characterAnchor', 'span', 'gutter', 'xs', 'sm', 'md', 'lg'],
  template: `<div class="stub" ${extra}><slot /><slot name="header-buttons" /><slot name="footer" /></div>`,
})

const mountPage = () =>
  mount(PromptManage, {
    global: {
      stubs: {
        ProTable: stubComponent(),
        ProForm: {
          template: '<div class="stub-proform"><slot /></div>',
          methods: { validate: () => Promise.resolve(true) },
        },
        PlatformImageGroups: stubComponent('data-test="platform-groups"', 'PlatformImageGroups'),
        SequenceStepEditor: stubComponent('data-test="step-editor"', 'SequenceStepEditor'),
        'el-row': stubComponent(),
        'el-col': stubComponent(),
        'el-card': stubComponent(),
        'el-dialog': stubComponent('data-test="dialog"'),
        'el-button': stubComponent(),
        'el-tag': stubComponent(),
        'el-image': stubComponent(),
        'el-select': stubComponent(),
        'el-option': stubComponent(),
        'el-upload': stubComponent(),
        'el-radio-group': stubComponent(),
        'el-radio-button': stubComponent(),
        'el-form-item': stubComponent(),
        'el-input': stubComponent(),
        'el-input-number': stubComponent(),
      },
    },
  })

/** 取 setup 暴露的内部状态（script setup 编译后可从 vm 读取） */
const vm = (wrapper: ReturnType<typeof mountPage>) => wrapper.vm as unknown as Record<string, any>

describe('PromptManage.vue 后台发布能力对齐', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mocks.promptApi.getPrompts.mockResolvedValue({ data: { rows: [], total: 0 } })
    mocks.promptApi.getStats.mockResolvedValue({ data: {} })
    mocks.promptApi.getCategoryOptions.mockResolvedValue({ data: [{ id: 1, name: '人物' }] })
    mocks.promptApi.getModelOptions.mockResolvedValue({ data: ['Midjourney'] })
    mocks.promptApi.getPlatformOptions.mockResolvedValue({ data: [{ id: 2, name: '通用' }] })
    mocks.promptApi.getParentOptions.mockResolvedValue({ data: [] })
    mocks.promptApi.uploadImage.mockResolvedValue({ data: { id: 'f1', url: '/uploads/a.png' } })
    mocks.promptApi.createPrompt.mockResolvedValue({ data: { id: 1 } })
    mocks.promptApi.updatePrompt.mockResolvedValue({ data: { id: 1 } })
  })

  it('1. 新建单条：默认带一个平台组，提交 payload 使用 platformGroups（不再传平铺 images）', async () => {
    const wrapper = mountPage()
    await nextTick()
    await nextTick()
    const state = vm(wrapper)
    await state.openDialog()
    expect(state.form.type).toBe('single')
    expect(state.form.platformGroups).toHaveLength(1)
    expect(state.form.platformGroups[0].platformId).toBe(2)

    state.form.title = '标题'
    state.form.content = '正文'
    state.form.categoryIds = [1]
    state.form.modelName = 'Midjourney'
    state.form.platformGroups[0].images.push({ url: '/uploads/a.png', filePath: 'f1', sort: 0, isCover: true })
    await state.handleSubmit('publish')

    expect(mocks.promptApi.createPrompt).toHaveBeenCalledTimes(1)
    const payload = mocks.promptApi.createPrompt.mock.calls[0][0]
    expect(payload.type).toBe('single')
    expect(payload.action).toBe('publish')
    expect(payload.platformGroups).toEqual([{ platformId: 2, images: [{ url: '/uploads/a.png', filePath: 'f1', sort: 0, isCover: true }] }])
    expect(payload.images).toBeUndefined()
    expect(payload.steps).toBeUndefined()
  })

  it('2. 新建套组：切换到 sequence 后自动生成步骤，提交 payload 携带 steps 与角色锚点', async () => {
    const wrapper = mountPage()
    await nextTick()
    await nextTick()
    const state = vm(wrapper)
    state.form.type = 'sequence'
    state.form.platformGroups = []
    state.form.steps = [
      {
        name: '起步',
        actionPrompt: '动作提示词',
        camera: 'low angle',
        seconds: 5,
        transition: 'fade',
        platformGroups: [{ platformId: 2, images: [{ url: '/uploads/s1.png', filePath: 'f2', sort: 0, isCover: true }] }],
      },
    ]
    state.form.characterAnchor = '红衣少女'
    state.form.title = '套组标题'
    state.form.content = '套组正文'
    state.form.categoryIds = [1]
    state.form.modelName = 'Midjourney'
    await state.handleSubmit('publish')

    const payload = mocks.promptApi.createPrompt.mock.calls[0][0]
    expect(payload.type).toBe('sequence')
    expect(payload.characterAnchor).toBe('红衣少女')
    expect(payload.platformGroups).toBeUndefined()
    expect(payload.steps).toHaveLength(1)
    expect(payload.steps[0]).toMatchObject({
      stepOrder: 1,
      name: '起步',
      actionPrompt: '动作提示词',
      camera: 'low angle',
      seconds: 5,
      transition: 'fade',
    })
    expect(payload.steps[0].platformGroups[0].images[0].url).toBe('/uploads/s1.png')
  })

  it('3. 切换内容形态：单条 ↔ 套组各自保留可编辑的默认组/步骤', async () => {
    const wrapper = mountPage()
    await nextTick()
    await nextTick()
    const state = vm(wrapper)
    state.form.type = 'sequence'
    state.form.platformGroups = []
    state.form.steps = []
    state.ensureTypeDefaults()
    expect(state.form.steps).toHaveLength(1)
    expect(state.form.steps[0].platformGroups[0].platformId).toBe(2)

    state.form.type = 'single'
    state.form.steps = []
    state.form.platformGroups = []
    state.ensureTypeDefaults()
    expect(state.form.platformGroups).toHaveLength(1)
  })

  it('4. 编辑套组：getPrompt 返回的 steps/platformGroups 正确回显到表单', async () => {
    mocks.promptApi.getPrompt.mockResolvedValue({
      data: {
        id: 9,
        title: '已有套组',
        content: '正文',
        categoryId: 1,
        categoryIds: [1],
        modelName: 'Midjourney',
        type: 'sequence',
        characterAnchor: '锚点A',
        parentId: null,
        steps: [
          {
            id: 3,
            stepOrder: 1,
            name: '第一步',
            actionPrompt: '提示词',
            camera: null,
            seconds: 5,
            transition: null,
            platformGroups: [
              {
                platformId: 2,
                platformName: '通用',
                coverImage: '/uploads/x.png',
                images: [{ id: 4, url: '/uploads/x.png', platformId: 2, isCover: 1, sort: 0 }],
              },
            ],
          },
        ],
        images: [],
        platformGroups: [],
      },
    })
    const wrapper = mountPage()
    await nextTick()
    await nextTick()
    const state = vm(wrapper)
    await state.openDialog({ id: 9 })

    expect(state.form.type).toBe('sequence')
    expect(state.form.characterAnchor).toBe('锚点A')
    expect(state.form.steps).toHaveLength(1)
    expect(state.form.steps[0].name).toBe('第一步')
    expect(state.form.steps[0].platformGroups[0].images[0]).toMatchObject({
      url: '/uploads/x.png',
      isCover: true,
      filePath: null,
    })
  })

  it('5. 编辑旧单条数据：无 platformGroups 时，images 归入首图所属平台', async () => {
    mocks.promptApi.getPrompt.mockResolvedValue({
      data: {
        id: 8,
        title: '旧数据',
        content: '正文',
        categoryId: 1,
        categoryIds: [1],
        modelName: 'SD',
        parentId: null,
        images: [{ id: 1, url: '/uploads/old.png', platformId: 7, isCover: 1, sort: 0 }],
      },
    })
    const wrapper = mountPage()
    await nextTick()
    await nextTick()
    const state = vm(wrapper)
    await state.openDialog({ id: 8 })

    expect(state.form.type).toBe('single')
    expect(state.form.platformGroups[0].platformId).toBe(7)
    expect(state.form.platformGroups[0].images[0].url).toBe('/uploads/old.png')
  })

  it('6. 校验：发布时无效果图被拦截；步骤缺字段被拦截；平台重复被拦截', async () => {
    const wrapper = mountPage()
    await nextTick()
    await nextTick()
    const state = vm(wrapper)
    await state.openDialog()
    state.form.title = '标题'
    state.form.content = '正文'
    state.form.categoryIds = [1]
    state.form.modelName = 'MJ'

    await state.handleSubmit('publish')
    expect(mocks.promptApi.createPrompt).not.toHaveBeenCalled()
    expect(mocks.message.warning).toHaveBeenCalledWith(expect.stringContaining('效果图'))

    state.form.platformGroups[0].images.push({ url: '/uploads/a.png', filePath: 'f1', sort: 0, isCover: true })
    state.form.platformGroups.push({ platformId: 2, images: [] })
    await state.handleSubmit('publish')
    expect(mocks.message.warning).toHaveBeenCalledWith(expect.stringContaining('平台'))

    state.form.platformGroups = []
    state.form.type = 'sequence'
    state.form.steps = [{ name: '', actionPrompt: '', platformGroups: [] }]
    await state.handleSubmit('publish')
    expect(mocks.message.warning).toHaveBeenCalledWith(expect.stringContaining('缺少动作名'))
  })

  it('7. 上传通道：后台编辑器使用 promptApi.uploadImage 专用通道', async () => {
    const wrapper = mountPage()
    await nextTick()
    await nextTick()
    const groups = wrapper.findComponent({ name: 'PlatformImageGroups' })
    expect(groups.exists()).toBe(true)
    expect(groups.props('uploader')).toBe(mocks.promptApi.uploadImage)
  })

  it('8. 响应式穿透：真实 ProForm 下，上传组件 emit 新数组后 form 与提交 payload 都拿到新图（历史 bug 场景）', async () => {
    const wrapper = mount(PromptManage, {
      global: {
        stubs: {
          ProTable: stubComponent(),
          PlatformImageGroups: stubComponent('', 'PlatformImageGroups'),
          SequenceStepEditor: stubComponent('', 'SequenceStepEditor'),
          'el-row': stubComponent(),
          'el-col': stubComponent(),
          'el-card': stubComponent(),
          'el-form': {
            name: 'ElForm',
            template: '<form><slot /></form>',
            methods: { validate: () => Promise.resolve(true) },
          },
          'el-divider': stubComponent(),
          'el-dialog': stubComponent('data-test="dialog"'),
          'el-button': stubComponent(),
          'el-tag': stubComponent(),
          'el-image': stubComponent(),
          'el-select': stubComponent(),
          'el-option': stubComponent(),
          'el-upload': stubComponent(),
          'el-radio-group': stubComponent(),
          'el-radio-button': stubComponent(),
          'el-form-item': stubComponent(),
        },
      },
    })
    await nextTick()
    await nextTick()
    const state = vm(wrapper)
    await state.openDialog()
    state.form.title = '标题'
    state.form.content = '正文'
    state.form.categoryIds = [1]
    state.form.modelName = 'MJ'

    // 模拟 PictureGroups 上传成功后 emit 出的完整新数组（真实组件行为）
    const groups = wrapper.findComponent({ name: 'PlatformImageGroups' })
    const nextGroups = [{ platformId: 2, images: [{ url: '/uploads/new.png', filePath: 'f9', sort: 0, isCover: true }] }]
    groups.vm.$emit('update:modelValue', nextGroups)
    await nextTick()
    await nextTick()
    await nextTick()

    expect(state.form.platformGroups[0]?.images[0]?.url).toBe('/uploads/new.png')

    await state.handleSubmit('publish')
    const payload = mocks.promptApi.createPrompt.mock.calls[0][0]
    expect(payload.platformGroups[0].images[0].url).toBe('/uploads/new.png')
  })
})
