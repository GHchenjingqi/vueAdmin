import { describe, it, expect, beforeEach } from 'vitest'
import router from '@/router/index'
import { pinia } from '@/stores/pinia'
import { useUserStore } from '@/stores/userStore'
import { addDynamicRoutes, clearDynamicRoutes } from '@/router/dynamicRoutes'
import type { Menu } from '@/types/api'
import type { User } from '@/types/api'

// 模拟一条后台菜单路由（注册为 Layout 子路由）
const backendMenus: Menu[] = [{ id: 2, name: '仪表盘', path: '/dashboard', component: 'views/Dashboard.vue', type: 'M', status: 1, children: [] }]

function loginAs(roles: string[]): void {
  const user = { id: 1, username: 'tester', nickname: '测试用户', status: 1, roles, permissions: [] } as unknown as User
  useUserStore(pinia).login(user, 'mock-token')
}

describe('后台路由守卫：仅管理员可访问', () => {
  beforeEach(() => {
    localStorage.clear()
    useUserStore(pinia).logout()
    clearDynamicRoutes()
    // 清理上一测试注册的命名动态路由，避免累积
    const preserved = ['Layout', 'Login', 'ForcePasswordChange', 'ResetPassword', 'NotFound', 'profile', 'AiProviders']
    router
      .getRoutes()
      .filter((r) => r.name && !preserved.includes(r.name as string) && !String(r.name).startsWith('Portal'))
      .forEach((r) => router.removeRoute(r.name as string))
  })

  it('普通用户访问后台路由被重定向到前台广场', async () => {
    addDynamicRoutes(backendMenus)
    loginAs(['user'])

    await router.push('/dashboard')

    expect(router.currentRoute.value.path).toBe('/portal/prompts')
  })

  it('普通用户携带 user 角色（非 admin）无法访问 Layout 下任意后台路由', async () => {
    addDynamicRoutes(backendMenus)
    loginAs(['user', 'editor'])

    await router.push('/dashboard')

    expect(router.currentRoute.value.path).toBe('/portal/prompts')
  })

  it('管理员可正常访问后台路由', async () => {
    addDynamicRoutes(backendMenus)
    loginAs(['admin'])

    await router.push('/dashboard')

    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('超级管理员 super_admin 可正常访问后台路由', async () => {
    addDynamicRoutes(backendMenus)
    loginAs(['super_admin'])

    await router.push('/dashboard')

    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('已登录普通用户访问前台路由不受影响', async () => {
    addDynamicRoutes(backendMenus)
    loginAs(['user'])

    await router.push('/portal/mine')

    expect(router.currentRoute.value.path).toBe('/portal/mine')
  })
})
