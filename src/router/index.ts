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
    redirect: '/portal/prompts',
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
      {
        path: 'workflows/:id/design',
        name: 'WorkflowDesigner',
        component: () => import('@/views/WorkflowDesigner.vue'),
        meta: { title: '流程设计' },
      },
    ],
  },
  // 提示词平台前台：独立 Layout，与后台共用同一套登录态和数据源
  {
    path: '/portal',
    component: () => import('@/views/portal/FrontLayout.vue'),
    children: [
      { path: '', redirect: '/portal/prompts' },
      {
        path: 'prompts',
        name: 'PortalPrompts',
        component: () => import('@/views/portal/PromptSquare.vue'),
        meta: { title: '发现' },
      },
      {
        path: 'poses',
        name: 'PortalPoses',
        component: () => import('@/views/portal/PoseGallery.vue'),
        meta: { title: '姿势参考库' },
      },
      {
        path: 'collections',
        name: 'PortalCollections',
        component: () => import('@/views/portal/CollectionSquare.vue'),
        meta: { title: '提示词专题' },
      },
      {
        path: 'characters',
        name: 'PortalCharacters',
        component: () => import('@/views/portal/CharacterSquare.vue'),
        meta: { title: '角色库' },
      },
      {
        path: 'skills',
        name: 'PortalSkills',
        component: () => import('@/views/portal/SkillSquare.vue'),
        meta: { title: 'Skills 下载' },
      },
      {
        path: 'costumes',
        name: 'PortalCostumes',
        component: () => import('@/views/portal/CostumeGallery.vue'),
        meta: { title: '朝代服饰' },
      },
      {
        path: 'prompts/:id',
        name: 'PortalPromptDetail',
        component: () => import('@/views/portal/PromptDetail.vue'),
        meta: { title: '提示词详情' },
      },
      {
        path: 'publish',
        name: 'PortalPublish',
        component: () => import('@/views/portal/PublishPrompt.vue'),
        meta: { title: '发布提示词' },
      },
      {
        path: 'publish/:id',
        name: 'PortalEdit',
        component: () => import('@/views/portal/PublishPrompt.vue'),
        meta: { title: '编辑投稿' },
      },
      {
        path: 'publish-collection',
        name: 'PortalPublishCollection',
        component: () => import('@/views/portal/PublishCollection.vue'),
        meta: { title: '发布提示词专题' },
      },
      {
        path: 'publish-collection/:id',
        name: 'PortalPublishCollectionEdit',
        component: () => import('@/views/portal/PublishCollection.vue'),
        meta: { title: '编辑提示词专题' },
      },
      {
        path: 'publish-character',
        name: 'PortalPublishCharacter',
        component: () => import('@/views/portal/PublishCharacter.vue'),
        meta: { title: '发布角色' },
      },
      {
        path: 'publish-character/:id',
        name: 'PortalPublishCharacterEdit',
        component: () => import('@/views/portal/PublishCharacter.vue'),
        meta: { title: '编辑角色' },
      },
      {
        path: 'mine',
        name: 'PortalMine',
        component: () => import('@/views/portal/MyPrompts.vue'),
        meta: { title: '我的投稿' },
      },
      {
        path: 'favorites',
        name: 'PortalFavorites',
        component: () => import('@/views/portal/MyFavorites.vue'),
        meta: { title: '我的收藏' },
      },
      {
        path: 'login',
        name: 'PortalLogin',
        component: () => import('@/views/portal/FrontLogin.vue'),
        meta: { title: '登录' },
      },
      {
        path: 'register',
        name: 'PortalRegister',
        component: () => import('@/views/portal/FrontRegister.vue'),
        meta: { title: '注册' },
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
  // 管理员判定口径与 v-permission / 前台「后台管理」入口保持一致
  const isAdmin = userStore.roles.some((role) => role === 'admin' || role === 'super_admin')
  // 后台页面均为名为 Layout 的父路由的子路由（含动态菜单注册）；前台在 /portal 下，不受此限
  const isBackendRoute = to.matched.some((record) => record.name === 'Layout')

  if (to.meta.requiresAuth && !isLoggedIn) {
    next({ path: '/login' })
  } else if (to.name === 'NotFound' && !isLoggedIn) {
    next({ path: '/login' })
  } else if (to.path === '/login' && isLoggedIn) {
    const currentPath: string = to.path
    if (passwordResetRequired && currentPath !== '/force-password-change') {
      next({ path: '/force-password-change' })
    } else {
      // 已登录用户误入 /login 时回到后台首页（站点根路径 '/' 现为前台广场）
      next({ path: '/dashboard' })
    }
  } else if (isBackendRoute && isLoggedIn && !isAdmin) {
    // 非管理员禁止进入后台（手动输入后台路径同样拦截），统一回到前台广场
    next({ path: '/portal/prompts' })
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
