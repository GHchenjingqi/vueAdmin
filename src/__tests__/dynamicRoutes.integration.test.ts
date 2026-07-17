import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import router from '@/router/index'
import { addDynamicRoutes, clearDynamicRoutes } from '@/router/dynamicRoutes'
import { useMenuStore } from '@/stores/menuStore'
import type { Menu } from '@/types/api'

const apiMenus: Menu[] = [
  { id: 2, name: '仪表盘', path: '/dashboard', component: 'views/Dashboard.vue', type: 'M', status: 1, children: [] },
  {
    id: 1,
    name: '系统管理',
    path: '/system',
    type: 'M',
    status: 1,
    children: [
      { id: 3, name: '用户管理', path: '/users', component: 'views/UserList.vue', type: 'M', status: 1, children: [] },
      { id: 4, name: '系统日志', path: '/logs', component: 'views/SystemLog.vue', type: 'M', status: 1, children: [] },
    ],
  },
  {
    id: 20,
    name: '系统监控',
    path: '/monitor',
    type: 'M',
    status: 1,
    children: [{ id: 21, name: '服务监控', path: '/server-monitor', component: 'views/ServerMonitor.vue', type: 'M', status: 1, children: [] }],
  },
]

describe('dynamicRoutes registration (integration)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    clearDynamicRoutes()
    const dyn = (router as unknown as { getRoutes(): Array<{ name?: string }> })
      .getRoutes()
      .filter((r) => r.name && !['Layout', 'Login', 'ForcePasswordChange', 'ResetPassword', 'NotFound', 'profile', 'AiProviders'].includes(r.name as string))
    dyn.forEach((r) => router.removeRoute(r.name as string))
  })

  it('registers routes for M-type menus with component', () => {
    addDynamicRoutes(apiMenus)
    const store = useMenuStore()
    expect(store.menuTree.length).toBeGreaterThan(0)
    expect(router.hasRoute('users')).toBe(true)
    expect(router.hasRoute('dashboard')).toBe(true)
    expect(router.hasRoute('logs')).toBe(true)
    expect(router.hasRoute('server-monitor')).toBe(true)
  })

  it('navigating to a registered menu path resolves a matched route', () => {
    addDynamicRoutes(apiMenus)
    const resolved = router.resolve('/users')
    expect(resolved.matched.length).toBeGreaterThan(0)
    const names = resolved.matched.map((m) => m.name)
    expect(names).toContain('users')
    expect(names).toContain('Layout')
  })

  it('directory (D) menus with null component are NOT registered as routes', () => {
    addDynamicRoutes(apiMenus)
    expect(router.hasRoute('system')).toBe(false)
    expect(router.hasRoute('monitor')).toBe(false)
  })
})
