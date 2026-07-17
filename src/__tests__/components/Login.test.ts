import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const mocks = vi.hoisted(() => {
  const mockRouterPush = vi.fn()

  const mockAuthApi = {
    login: vi.fn(),
    captcha: vi.fn(),
    forgotPassword: vi.fn(),
    logout: vi.fn(),
  }

  const mockSiteApi = {
    info: vi.fn(),
  }

  const mockInitDynamicRoutes = vi.fn().mockResolvedValue(true)

  return { mockRouterPush, mockAuthApi, mockSiteApi, mockInitDynamicRoutes }
})

vi.mock('@/api', () => ({
  authApi: mocks.mockAuthApi,
  siteApi: mocks.mockSiteApi,
}))

vi.mock('@/router/initSession', () => ({
  initDynamicRoutes: mocks.mockInitDynamicRoutes,
}))

vi.mock('@/utils/sanitize', () => ({
  sanitizeSvg: vi.fn((svg: string) => svg),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
    },
  }
})

vi.mock('vue-router', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    useRouter: () => ({
      push: mocks.mockRouterPush,
    }),
  }
})
import Login from '@/views/Login.vue'

describe('Login.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())

    mocks.mockAuthApi.captcha.mockResolvedValue({
      data: { enabled: false, svg: '', key: '' },
    })
    mocks.mockSiteApi.info.mockResolvedValue({
      data: { title: 'Test Admin', logo: '' },
    })
  })

  function createWrapper() {
    return mount(Login, {
      global: {
        stubs: {
          'el-dropdown': { template: '<div class="el-dropdown"><slot /><slot name="dropdown" /></div>' },
          'el-dropdown-menu': { template: '<div class="el-dropdown-menu"><slot /></div>' },
          'el-dropdown-item': { template: '<div class="el-dropdown-item"><slot /></div>' },
          'el-button': {
            template: '<button class="el-button" :disabled="disabled" :loading="loading"><slot /></button>',
            props: ['disabled', 'loading', 'type', 'text', 'icon', 'link'],
          },
          'el-icon': { template: '<span class="el-icon"><slot /></span>' },
          'el-form': {
            template: '<form class="el-form"><slot /></form>',
            props: ['model', 'rules', 'size'],
          },
          'el-form-item': { template: '<div class="el-form-item"><slot /></div>' },
          'el-input': {
            template: '<input class="el-input" :value="modelValue" :type="type" :placeholder="placeholder" />',
            props: ['modelValue', 'type', 'placeholder', 'prefixIcon', 'clearable', 'showPassword'],
          },
          'el-checkbox': {
            template: '<label class="el-checkbox"><input type="checkbox" :checked="modelValue" /><slot /></label>',
            props: ['modelValue'],
          },
          'el-link': {
            template: '<a class="el-link"><slot /></a>',
            props: ['type', 'underline'],
          },
          'el-dialog': {
            template: '<div v-if="modelValue" class="el-dialog"><slot /><slot name="footer" /></div>',
            props: ['modelValue', 'title', 'width', 'closeOnClickModal', 'destroyOnClose'],
          },
        },
      },
    })
  }

  it('渲染登录表单', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.login-page').exists()).toBe(true)
    expect(wrapper.find('.login-form').exists()).toBe(true)
  })

  it('显示用户名和密码输入框', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    const inputs = wrapper.findAll('.el-input')
    expect(inputs.length).toBeGreaterThanOrEqual(2)
  })

  it('显示登录按钮', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    const buttons = wrapper.findAll('.el-button')
    const loginBtn = buttons.find((b) => b.text().includes('login') || b.text().includes('登录'))
    expect(loginBtn).toBeTruthy()
  })

  it('显示记住我复选框', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.el-checkbox').exists()).toBe(true)
  })

  it('显示忘记密码链接', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.el-link').exists()).toBe(true)
  })

  it('组件挂载时获取站点信息', async () => {
    createWrapper()
    await nextTick()
    await nextTick()

    expect(mocks.mockSiteApi.info).toHaveBeenCalled()
  })

  it('组件挂载时获取验证码配置', async () => {
    createWrapper()
    await nextTick()
    await nextTick()

    expect(mocks.mockAuthApi.captcha).toHaveBeenCalled()
  })

  it('点击忘记密码打开对话框', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    const forgotLink = wrapper.find('.el-link')
    await forgotLink.trigger('click')
    await nextTick()

    expect(wrapper.find('.el-dialog').exists()).toBe(true)
  })

  it('显示品牌标题', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.brand-title').exists()).toBe(true)
  })

  it('显示版权信息', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.login-copyright').exists()).toBe(true)
  })
})
