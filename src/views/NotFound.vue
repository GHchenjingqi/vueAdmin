<template>
  <div
    class="not-found-page"
    role="main"
    aria-labelledby="not-found-title"
  >
    <div
      class="not-found-bg"
      aria-hidden="true"
    >
      <span class="cloud cloud-1" />
      <span class="cloud cloud-2" />
      <span class="cloud cloud-3" />
      <span class="dot dot-1" />
      <span class="dot dot-2" />
      <span class="dot dot-3" />
      <span class="plus plus-1" />
      <span class="plus plus-2" />
      <span class="diamond diamond-1" />
      <span class="diamond diamond-2" />
    </div>

    <div class="not-found-content">
      <div
        class="illustration"
        aria-hidden="true"
      >
        <div class="window">
          <div class="window-bar">
            <span class="window-dot" />
            <span class="window-dot" />
            <span class="window-dot" />
          </div>
          <div class="window-body">
            <div class="code">
              404
            </div>
          </div>
        </div>

        <div class="cone">
          <div class="cone-body" />
          <div class="cone-stripe cone-stripe-1" />
          <div class="cone-stripe cone-stripe-2" />
          <div class="cone-base" />
        </div>

        <div class="search-bubble">
          <el-icon :size="28">
            <Search />
          </el-icon>
        </div>
      </div>

      <h1
        id="not-found-title"
        class="title"
      >
        {{ t('errorPage.notFoundTitle') }}
      </h1>
      <p class="desc">
        {{ t('errorPage.notFoundDesc') }}
      </p>

      <div class="actions">
        <el-button
          type="primary"
          size="large"
          class="action-btn action-btn--primary"
          :loading="homeLoading"
          @click="goHome"
        >
          <el-icon class="action-icon">
            <HomeFilled />
          </el-icon>
          {{ t('common.backToHome') }}
        </el-button>
        <el-button
          size="large"
          class="action-btn action-btn--ghost"
          :disabled="homeLoading"
          @click="goBack"
        >
          <el-icon class="action-icon">
            <ArrowLeft />
          </el-icon>
          {{ t('common.backToPrevious') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, HomeFilled, Search } from '@element-plus/icons-vue'
import { useI18n } from '@/i18n'
import { addDynamicRoutes } from '@/router/dynamicRoutes'
import { useMenuStore } from '@/stores/menuStore'
import { useUserStore } from '@/stores/userStore'
import type { Menu } from '@/types/api'

const router = useRouter()
const menuStore = useMenuStore()
const userStore = useUserStore()
const { t } = useI18n()
const homeLoading = ref(false)

function normalizePath(path?: string | null): string {
  if (!path) return '/'
  return path.startsWith('/') ? path : `/${path}`
}

function isNavigablePath(path: string): boolean {
  const resolved = router.resolve(path)
  if (!resolved.matched.length) return false
  // Catch-all 404 also has matched routes; exclude it explicitly.
  return resolved.name !== 'NotFound'
}

async function ensureDynamicMenus(): Promise<void> {
  if (!userStore.isLoggedIn) return

  if (!menuStore.hasMenus) {
    await menuStore.fetchMenus()
  }

  const menus = menuStore.menuTree as Menu[]
  if (menus.length) {
    // Only register routes. Do not call initDynamicRoutes/tryRestorePath here,
    // otherwise the page may be redirected back to the invalid saved path.
    addDynamicRoutes(menus)
  }
}

async function resolveHomePath(): Promise<string> {
  await ensureDynamicMenus()

  const candidates = [menuStore.findFirstMenuPath(), '/dashboard', '/']
  for (const candidate of candidates) {
    const path = normalizePath(candidate)
    if (isNavigablePath(path)) {
      return path
    }
  }

  return '/'
}

async function goHome() {
  if (homeLoading.value) return
  homeLoading.value = true
  const currentPath = router.currentRoute.value.path
  try {
    const homePath = await resolveHomePath()
    if (currentPath === homePath) return
    await router.replace(homePath)
    // 导航守卫可能重定向了路由，但浏览器地址栏未更新（常见于 IP 直连 + createWebHistory）。
    // 若 URL 仍停留在 404 路径，强制硬跳转确保地址栏同步。
    if (window.location.pathname === currentPath) {
      window.location.href = homePath
    }
  } catch (error) {
    console.error('[NotFound] goHome failed:', error)
    const fallback = userStore.isLoggedIn ? '/' : '/login'
    if (window.location.pathname !== fallback) {
      try {
        await router.replace(fallback)
      } catch {
        window.location.href = fallback
      }
    }
  } finally {
    homeLoading.value = false
  }
}

function goBack() {
  const historyState = window.history.state as { back?: unknown } | null
  // Vue Router keeps previous location in history.state.back.
  // history.length is unreliable in SPA and often > 1 even without app history.
  if (historyState?.back != null) {
    router.back()
    return
  }
  void goHome()
}
</script>

<style scoped>
.not-found-page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 40px 24px;
  overflow: hidden;
  background:
    radial-gradient(circle at 18% 22%, rgba(64, 169, 255, 0.14), transparent 28%),
    radial-gradient(circle at 82% 18%, rgba(105, 177, 255, 0.12), transparent 24%),
    radial-gradient(circle at 50% 100%, rgba(24, 144, 255, 0.08), transparent 36%), linear-gradient(180deg, #f7fbff 0%, #f3f8ff 48%, #f8fafc 100%);
}

.not-found-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.cloud {
  position: absolute;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 8px 24px rgba(64, 158, 255, 0.08);
}

.cloud::before,
.cloud::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  background: inherit;
}

.cloud-1 {
  top: 12%;
  left: 10%;
  width: 120px;
  height: 36px;
}

.cloud-1::before {
  top: -18px;
  left: 18px;
  width: 42px;
  height: 42px;
}

.cloud-1::after {
  top: -24px;
  left: 48px;
  width: 54px;
  height: 54px;
}

.cloud-2 {
  top: 18%;
  right: 12%;
  width: 96px;
  height: 28px;
}

.cloud-2::before {
  top: -14px;
  left: 14px;
  width: 34px;
  height: 34px;
}

.cloud-2::after {
  top: -18px;
  left: 38px;
  width: 42px;
  height: 42px;
}

.cloud-3 {
  bottom: 16%;
  left: 16%;
  width: 84px;
  height: 24px;
  opacity: 0.7;
}

.cloud-3::before {
  top: -12px;
  left: 12px;
  width: 28px;
  height: 28px;
}

.cloud-3::after {
  top: -16px;
  left: 34px;
  width: 34px;
  height: 34px;
}

.dot,
.plus,
.diamond {
  position: absolute;
  color: rgba(64, 158, 255, 0.35);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.dot-1 {
  top: 28%;
  left: 28%;
}

.dot-2 {
  top: 36%;
  right: 24%;
}

.dot-3 {
  bottom: 28%;
  right: 18%;
  width: 6px;
  height: 6px;
}

.plus {
  width: 12px;
  height: 12px;
}

.plus::before,
.plus::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  background: currentColor;
  border-radius: 999px;
  transform: translate(-50%, -50%);
}

.plus::before {
  width: 12px;
  height: 2px;
}

.plus::after {
  width: 2px;
  height: 12px;
}

.plus-1 {
  top: 24%;
  right: 30%;
}

.plus-2 {
  bottom: 24%;
  left: 30%;
}

.diamond {
  width: 10px;
  height: 10px;
  border: 2px solid currentColor;
  border-radius: 2px;
  transform: rotate(45deg);
  background: transparent;
}

.diamond-1 {
  top: 42%;
  left: 18%;
}

.diamond-2 {
  top: 20%;
  right: 36%;
  width: 8px;
  height: 8px;
}

.not-found-content {
  position: relative;
  z-index: 1;
  width: min(100%, 560px);
  text-align: center;
}

.illustration {
  position: relative;
  width: min(100%, 420px);
  height: 250px;
  margin: 0 auto 28px;
}

.window {
  position: absolute;
  left: 50%;
  top: 18px;
  width: min(100%, 320px);
  height: 190px;
  transform: translateX(-50%);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 251, 255, 0.96) 100%);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow:
    0 18px 48px rgba(64, 158, 255, 0.12),
    0 4px 16px rgba(15, 35, 75, 0.05);
  overflow: hidden;
}

.window-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(230, 239, 250, 0.9);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.window-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d9e8fb;
}

.window-dot:nth-child(1) {
  background: #ffb4b4;
}

.window-dot:nth-child(2) {
  background: #ffd59e;
}

.window-dot:nth-child(3) {
  background: #9ad7ff;
}

.window-body {
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(100% - 36px);
  background:
    radial-gradient(circle at 50% 48%, rgba(64, 169, 255, 0.08), transparent 42%), linear-gradient(180deg, rgba(255, 255, 255, 0.2), rgba(236, 245, 255, 0.35));
}

.code {
  font-size: clamp(84px, 16vw, 120px);
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.04em;
  background: linear-gradient(180deg, #69b1ff 0%, #1890ff 55%, #1677ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 10px 30px rgba(24, 144, 255, 0.12);
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.cone {
  position: absolute;
  left: calc(50% - 168px);
  bottom: 28px;
  width: 58px;
  height: 78px;
  filter: drop-shadow(0 10px 16px rgba(24, 144, 255, 0.18));
}

.cone-body {
  position: absolute;
  left: 50%;
  bottom: 10px;
  width: 0;
  height: 0;
  border-left: 22px solid transparent;
  border-right: 22px solid transparent;
  border-bottom: 60px solid #5b9dff;
  transform: translateX(-50%);
}

.cone-stripe {
  position: absolute;
  left: 50%;
  height: 10px;
  background: rgba(255, 255, 255, 0.92);
  transform: translateX(-50%);
  clip-path: polygon(8% 0, 92% 0, 100% 100%, 0 100%);
}

.cone-stripe-1 {
  bottom: 42px;
  width: 28px;
}

.cone-stripe-2 {
  bottom: 24px;
  width: 38px;
}

.cone-base {
  position: absolute;
  left: 50%;
  bottom: 4px;
  width: 42px;
  height: 10px;
  border-radius: 999px;
  background: #3f7fe0;
  transform: translateX(-50%);
  box-shadow: 0 4px 10px rgba(24, 144, 255, 0.2);
}

.search-bubble {
  position: absolute;
  right: calc(50% - 168px);
  bottom: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  color: #40a9ff;
  background: linear-gradient(180deg, #ffffff 0%, #f3f9ff 100%);
  border: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow:
    0 12px 28px rgba(64, 158, 255, 0.16),
    0 2px 8px rgba(15, 35, 75, 0.05);
}

.title {
  margin: 0;
  color: var(--text-primary, #303133);
  font-size: 28px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: 0;
}

.desc {
  margin: 12px 0 0;
  color: var(--text-secondary, #909399);
  font-size: 14px;
  line-height: 1.7;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-top: 28px;
}

.action-btn {
  min-width: 132px;
  height: 42px;
  border-radius: 8px;
  font-weight: 500;
}

.action-btn--primary {
  --el-button-bg-color: var(--mainColor, #1890ff);
  --el-button-border-color: var(--mainColor, #1890ff);
  --el-button-hover-bg-color: var(--mainColor-light, #40a9ff);
  --el-button-hover-border-color: var(--mainColor-light, #40a9ff);
  box-shadow: 0 8px 18px rgba(24, 144, 255, 0.22);
}

.action-btn--ghost {
  --el-button-bg-color: #ffffff;
  --el-button-border-color: #d9e4f5;
  --el-button-text-color: var(--text-regular, #606266);
  --el-button-hover-bg-color: #f5f9ff;
  --el-button-hover-border-color: #b7d4ff;
  --el-button-hover-text-color: var(--mainColor, #1890ff);
}

.action-icon {
  margin-right: 6px;
}

:global([data-theme='dark']) .not-found-page {
  background:
    radial-gradient(circle at 18% 22%, rgba(64, 169, 255, 0.12), transparent 28%),
    radial-gradient(circle at 82% 18%, rgba(105, 177, 255, 0.1), transparent 24%),
    radial-gradient(circle at 50% 100%, rgba(24, 144, 255, 0.08), transparent 36%), linear-gradient(180deg, #141820 0%, #12161d 48%, #10141a 100%);
}

:global([data-theme='dark']) .cloud {
  background: rgba(42, 52, 68, 0.78);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

:global([data-theme='dark']) .window {
  background: linear-gradient(180deg, rgba(34, 40, 52, 0.98) 0%, rgba(28, 34, 45, 0.96) 100%);
  border-color: rgba(68, 82, 104, 0.7);
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.28),
    0 4px 16px rgba(0, 0, 0, 0.16);
}

:global([data-theme='dark']) .window-bar {
  border-bottom-color: rgba(68, 82, 104, 0.7);
  background: linear-gradient(180deg, #252c39 0%, #1f2633 100%);
}

:global([data-theme='dark']) .window-body {
  background:
    radial-gradient(circle at 50% 48%, rgba(64, 169, 255, 0.12), transparent 42%), linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(24, 144, 255, 0.05));
}

:global([data-theme='dark']) .search-bubble {
  color: #69b1ff;
  background: linear-gradient(180deg, #273041 0%, #1f2735 100%);
  border-color: rgba(80, 100, 128, 0.8);
  box-shadow:
    0 12px 28px rgba(0, 0, 0, 0.28),
    0 2px 8px rgba(0, 0, 0, 0.16);
}

:global([data-theme='dark']) .action-btn--ghost {
  --el-button-bg-color: #1d2430;
  --el-button-border-color: #3a465b;
  --el-button-text-color: #cfd7e6;
  --el-button-hover-bg-color: #243041;
  --el-button-hover-border-color: #4f6f9b;
  --el-button-hover-text-color: #69b1ff;
}

@media (max-width: 640px) {
  .not-found-page {
    padding: 28px 16px;
  }

  .illustration {
    height: 220px;
    margin-bottom: 22px;
  }

  .window {
    width: min(100%, 280px);
    height: 170px;
  }

  .code {
    font-size: 88px;
  }

  .cone {
    left: calc(50% - 138px);
    transform: scale(0.92);
    transform-origin: bottom center;
  }

  .search-bubble {
    right: calc(50% - 138px);
    width: 56px;
    height: 56px;
  }

  .title {
    font-size: 22px;
  }

  .actions {
    gap: 12px;
  }

  .action-btn {
    min-width: 120px;
  }
}
</style>
