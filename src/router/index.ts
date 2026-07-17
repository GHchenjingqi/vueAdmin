/**
 * Vue Router 配置
 *
 * 路由守卫使用 Pinia userStore 判断登录态，
 * 替代原有的 localStorage 直接读写模式。
 */
import { createRouter, createWebHistory } from 'vue-router'
import { pinia } from '@/stores/pinia'
import { useUserStore } from '@/stores/userStore'
import { preloadSiblingRoutes } from './preload'
import { startProgress, doneProgress, forceDoneProgress } from '@/utils/nprogress'
import Layout from '@/views/Layout.vue'

// 在路由初始化前保存原始路径（刷新后动态路由尚未加载，catch-all 会重定向到 /，需要此值恢复）
export const savedPath: string = window.location.pathname

const routes = [
  {
    path: '/',
    name: 'Layout',
    component: Layout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/Profile.vue'),
        meta: { title: '个人中心' },
      },
      {
        path: 'ai-providers',
        name: 'AiProviders',
        component: () => import('@/views/AiProviderManager.vue'),
        meta: { title: 'AI 提供商管理' },
      },
    ],
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
  },
  {
    path: '/force-password-change',
    name: 'ForcePasswordChange',
    component: () => import('@/views/ForceChangePassword.vue'),
    meta: { requiresAuth: true, requiresPasswordChange: true },
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: () => import('@/views/ResetPassword.vue'),
  },
  // 兜底路由：未匹配到任何路由（含动态路由未注册的路径）时显示 404，
  // 不再静默 redirect 到 '/'，避免「点任意菜单都跳回首页」的误导。
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue'),
    meta: { title: '404' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 路由守卫 - 检查用户登录状态和强制改密
router.beforeEach((to, _from, next) => {
  startProgress()

  // 通过 Pinia 实例获取 Store（在非 setup 环境）
  const userStore = useUserStore(pinia)
  const isLoggedIn = userStore.isLoggedIn
  const passwordResetRequired = userStore.passwordResetRequired

  if (to.meta.requiresAuth && !isLoggedIn) {
    next({ path: '/login' })
  } else if (to.path === '/login' && isLoggedIn) {
    const currentPath: string = to.path
    if (passwordResetRequired && currentPath !== '/force-password-change') {
      next({ path: '/force-password-change' })
    } else {
      next({ path: '/' })
    }
  } else if (to.meta.requiresAuth && passwordResetRequired && !to.meta.requiresPasswordChange) {
    next({ path: '/force-password-change' })
  } else {
    next()
  }
})

// 路由跳转完成后结束进度条
router.afterEach(() => {
  doneProgress()
})

// 路由跳转异常时强制结束进度条
router.onError(() => {
  forceDoneProgress()
})

// 路由解析前预加载兄弟路由组件
router.beforeResolve((to) => {
  preloadSiblingRoutes(router, to.path)
})

export { routes }
export default router
