import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const mocks = vi.hoisted(() => {
  const mockDashboardApi = {
    getStats: vi.fn(),
  }
  const mockBillingApi = {
    getQuotaSnapshot: vi.fn(),
  }
  const mockElMessage = {
    error: vi.fn(),
    warning: vi.fn(),
  }

  return { mockDashboardApi, mockBillingApi, mockElMessage }
})

vi.mock('@/api', () => ({
  dashboardApi: mocks.mockDashboardApi,
}))

vi.mock('@/api/billing', () => ({
  billingApi: mocks.mockBillingApi,
}))

vi.mock('@/utils/error', () => ({
  getErrorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : 'Unknown error')),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: mocks.mockElMessage,
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
    mocks.mockBillingApi.getQuotaSnapshot.mockResolvedValue({
      data: {
        planCode: 'pro',
        periodEnd: '2026-12-01T00:00:00.000Z',
        metrics: [
          { metric: 'users', period: 'total', used: 8, limit: 20 },
          { metric: 'storage', period: 'total', used: 512, limit: 0 },
        ],
      },
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
          'el-tag': { template: '<span class="el-tag"><slot /></span>' },
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

  it('挂载时拉取配额快照并渲染「已用/上限」', async () => {
    const wrapper = createWrapper()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(mocks.mockBillingApi.getQuotaSnapshot).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.quota-card').exists()).toBe(true)
    expect(wrapper.findAll('.quota-bar').length).toBe(2)

    const values = wrapper.findAll('.quota-value').map((node) => node.text())
    expect(values[0]).toContain('8')
    expect(values[0]).toContain('20')
    expect(values[1]).toContain('512')
  })

  it('配额接口失败时仅提示警告，不影响统计卡片', async () => {
    mocks.mockBillingApi.getQuotaSnapshot.mockRejectedValue(new Error('quota down'))

    const wrapper = createWrapper()
    await nextTick()
    await nextTick()
    await nextTick()

    expect(mocks.mockElMessage.warning).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.quota-card').exists()).toBe(false)
    expect(wrapper.findAll('.stat-card').length).toBe(4)
  })
})
