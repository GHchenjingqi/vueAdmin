<template>
  <el-config-provider :locale="elementLocale">
    <!-- 跳过导航链接 - 仅键盘焦点时可见 -->
    <a href="#main-content" class="skip-to-content" tabindex="0">
      {{ t('accessibility.skipToContent') }}
    </a>

    <div v-if="!sessionInitialized" class="session-loading" role="status" aria-live="polite" :aria-label="t('accessibility.initializingSession')">
      <el-icon class="is-loading" :size="32">
        <Loading />
      </el-icon>
      <span class="sr-only">{{ t('common.loading') }}</span>
    </div>
    <router-view v-else />
  </el-config-provider>
</template>

<script setup lang="ts">
import { Loading } from '@element-plus/icons-vue'
import type { Language } from 'element-plus/es/locale'
import { useI18n } from '@/i18n'
import { siteApi } from '@/api'
import { setAccessToken } from '@/utils/request'
import { initDynamicRoutes } from '@/router/initSession'
import { useUserStore, useAppStore, useSettingStore, useNotificationStore } from '@/stores'
const elementLocale = inject<Language>('element-plus-locale')
const { t } = useI18n()
const router = useRouter()
const userStore = useUserStore()
const appStore = useAppStore()
const settingStore = useSettingStore()
const notificationStore = useNotificationStore()

const sessionInitialized = ref(false)

// App Store 初始化时自动从 localStorage 恢复主题（已内置在 appStore 的 watch 中）
// 这里只需确保初始化顺序

// 页面刷新时用 Refresh Token 静默恢复登录状态
const restoreSession = async (): Promise<void> => {
  // 从 localStorage 恢复用户信息到 Store
  userStore.restoreFromStorage()

  if (!userStore.isLoggedIn) return

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const res = await fetch('/api/v1/auth/token', {
      method: 'POST',
      credentials: 'include',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (res.status >= 500) {
      // 服务器内部错误，清除登录状态强制重新登录
      userStore.logout()
      router.push('/login')
      return
    }

    if (res.ok) {
      const data = await res.json()
      if (data.code === 0) {
        setAccessToken(data.data.accessToken)
        userStore.setToken(data.data.accessToken)
        if (data.data.passwordResetRequired) {
          userStore.setPasswordResetRequired(true)
        } else {
          userStore.setPasswordResetRequired(false)
        }
        return
      }
    }
  } catch {
    // 网络异常或超时，清除登录状态强制重新登录
    console.warn('会话恢复失败，将跳转到登录页')
    userStore.logout()
    router.push('/login')
    return
  }
  // 非 2xx 且非 5xx 响应（如 401），清除登录状态
  userStore.logout()
  router.push('/login')
}

onMounted(async () => {
  // 同步 localeStore 的语言到 i18n/index.ts
  // i18n/index.ts 在模块导入时就初始化了，需要确保与持久化的 localeStore 一致
  const { setLocale } = await import('@/i18n')
  setLocale(appStore.locale as 'zh-CN' | 'en-US')

  const SESSION_TIMEOUT = 15000
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      console.warn('restoreSession 超时，强制继续初始化')
      resolve()
    }, SESSION_TIMEOUT)
  })

  await Promise.race([restoreSession(), timeoutPromise])

  // 在渲染 Layout / 侧边栏之前，先拉取菜单并注册动态路由。
  // 否则用户点击菜单时对应路由尚未注册，会命中 catch-all（跳转首页 / 404）。
  if (userStore.isLoggedIn) {
    try {
      await initDynamicRoutes()
    } catch (err: unknown) {
      // 菜单加载失败：若已无登录态则退回登录页
      if (!userStore.isLoggedIn) {
        router.push('/login')
      } else {
        console.error('初始化动态路由失败:', err)
      }
    }
  }

  // session 就绪后才渲染子组件，避免 API 请求时 accessToken 未设置导致 401
  sessionInitialized.value = true

  try {
    const res = await siteApi.info()
    if (res.data) {
      appStore.setSiteInfo(
        res.data as {
          title?: string
          logo?: string
          favicon?: string
          description?: string
          keywords?: string
        },
      )
    }
  } catch {
    // 站点信息获取失败，使用默认值
  }

  // 后台已登录，加载系统设置并建立 SSE 连接
  if (userStore.isLoggedIn) {
    settingStore.loadSettings()
    notificationStore.connectSSE()
  }
})
</script>

<style lang="scss">
/* 全局重置样式 — 必须为非 scoped，仅包含重置和基础样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
</style>

<style lang="scss" scoped>
/* App 组件私有样式 */
.session-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: var(--el-color-primary);
}
</style>
