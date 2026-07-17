import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const mocks = vi.hoisted(() => {
  const mockDashboardApi = {
    getStats: vi.fn(),
  }

  return { mockDashboardApi }
})

vi.mock('@/api', () => ({
  dashboardApi: mocks.mockDashboardApi,
}))

vi.mock('@/utils/error', () => ({
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : 'Unknown error')),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: {
      error: vi.fn(),
    },
  }
})

import Dashboard from '@/views/Dashboard.vue'

describe('Dashboard.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())

    mocks.mockDashboardApi.getStats.mockResolvedValue({
      data: [{ value: 1234 }, { value: 56 }, { value: 89 }, { value: 12 }],
    })
  })

  function createWrapper() {
    return mount(Dashboard, {
      global: {
        stubs: {
          'el-row': { template: '<div class="el-row"><slot /></div>' },
          'el-col': {
            template: '<div class="el-col"><slot /></div>',
            props: ['xs', 'sm', 'md', 'span'],
          },
          'el-card': {
            template: '<div class="el-card"><slot name="header" /><slot /></div>',
            props: ['shadow', 'header'],
          },
          'el-skeleton': { template: '<div class="el-skeleton" />' },
          'el-icon': { template: '<span class="el-icon"><slot /></span>' },
          'el-progress': { template: '<div class="el-progress" />' },
          MenuIcon: { template: '<span class="menu-icon" />' },
          CaretTop: { template: '<span class="caret-top" />' },
          CaretBottom: { template: '<span class="caret-bottom" />' },
        },
      },
    })
  }

  it('渲染欢迎卡片', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.welcome-card').exists()).toBe(true)
  })

  it('显示问候语', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.welcome-greeting').exists()).toBe(true)
  })

  it('显示系统状态为运行中', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.status-online').exists()).toBe(true)
  })

  it('初始状态显示加载骨架屏', () => {
    const wrapper = createWrapper()
    expect(wrapper.findAll('.el-skeleton').length).toBeGreaterThan(0)
  })

  it('API 返回数据后隐藏骨架屏', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.findAll('.el-skeleton').length).toBe(0)
  })

  it('渲染系统信息卡片', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()

    expect(wrapper.find('.info-card').exists()).toBe(true)
  })

  it('数据加载成功后显示统计卡片', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.findAll('.stat-card').length).toBe(4)
  })

  it('挂载时调用 getStats API', () => {
    createWrapper()
    expect(mocks.mockDashboardApi.getStats).toHaveBeenCalledTimes(1)
  })

  it('API 失败时仍然隐藏加载状态', async () => {
    mocks.mockDashboardApi.getStats.mockRejectedValue(new Error('Network error'))

    const wrapper = createWrapper()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(wrapper.findAll('.el-skeleton').length).toBe(0)
  })
})
