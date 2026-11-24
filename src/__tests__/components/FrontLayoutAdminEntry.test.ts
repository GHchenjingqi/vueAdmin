import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import router, { routes } from '@/router/index'
import { pinia } from '@/stores/pinia'
import { useUserStore } from '@/stores/userStore'
import { addDynamicRoutes, clearDynamicRoutes } from '@/router/dynamicRoutes'
import type { Menu, User } from '@/types/api'

vi.mock('@/api', () => ({
  authApi: { logout: vi.fn().mockResolvedValue({}) },
  portalApi: {},
}))
vi.mock('element-plus', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }
})

const backendMenus: Menu[] = [{ id: 2, name: '仪表盘', path: '/dashboard', component: 'views/Dashboard.vue', type: 'M', status: 1, children: [] }]

function loginAsAdmin(): void {
  const user = { id: 1, username: 'admin', nickname: '管理员', status: 1, roles: ['admin'], permissions: [] } as unknown as User
  useUserStore(pinia).login(user, 'mock-token')
}

import FrontLayout from '@/views/portal/FrontLayout.vue'

const mountLayout = () =>
  mount(FrontLayout, {
    global: {
      plugins: [router, pinia],
      stubs: {
        'el-icon': { template: '<span><slot /></span>' },
        'el-avatar': { template: '<span><slot /></span>' },
        'el-dropdown': { template: '<div><slot /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { template: '<div><slot /></div>' },
        'el-input': { template: '<input />' },
        'el-button': { template: '<button><slot /></button>' },
        'router-view': { template: '<div />' },
      },
      mocks: { $t: (key: string) => key },
    },
  })

describe('FrontLayout 后台管理入口', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    useUserStore(pinia).logout()
    clearDynamicRoutes()
    const preserved = new Set(routes.map((r) => r.name).filter(Boolean) as string[])
    router
      .getRoutes()
      .filter((r) => r.name && !preserved.has(r.name as string) && !String(r.name).startsWith('Portal'))
      .forEach((r) => router.removeRoute(r.name as string))
  })

  it('管理员的后台管理入口指向 /dashboard，点击可进入后台', async () => {
    addDynamicRoutes(backendMenus)
    loginAsAdmin()

    const wrapper = mountLayout()
    const entry = wrapper.find('.side-admin-link')
    expect(entry.exists()).toBe(true)
    // router-link 渲染为 a，href/to 应指向后台而非根路径/前台广场
    expect(entry.attributes('href')).toBe('/dashboard')

    await entry.trigger('click')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('非管理员不显示后台管理入口', () => {
    const user = { id: 2, username: 'user', nickname: '用户', status: 1, roles: ['user'], permissions: [] } as unknown as User
    useUserStore(pinia).login(user, 'mock-token')

    const wrapper = mountLayout()
    expect(wrapper.find('.side-admin-link').exists()).toBe(false)
  })
})
