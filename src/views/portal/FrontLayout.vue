<template>
  <div class="front-layout">
    <!-- 顶部通栏：品牌 + 搜索 + 账户 -->
    <header class="front-header">
      <div class="front-header-inner">
        <router-link to="/portal/prompts" class="front-brand">
          <span class="front-brand-mark">
            <el-icon :size="19"><MagicStick /></el-icon>
          </span>
          <span class="front-brand-text">{{ t('portal.brand') }}</span>
        </router-link>

        <div class="front-search">
          <el-input v-model="searchInput" :placeholder="t('portal.searchPlaceholder')" clearable @keyup.enter="submitSearch" @clear="submitSearch">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button type="primary" :icon="Search" @click="submitSearch">{{ t('portal.searchButton') }}</el-button>
        </div>

        <div class="front-actions">
          <el-button v-if="!isLoggedIn" link class="front-login-link" @click="go('/portal/login')">{{ t('portal.login') }}</el-button>
          <el-button v-if="!isLoggedIn" type="primary" class="front-register-btn" @click="go('/portal/register')">{{ t('portal.register') }}</el-button>
          <el-dropdown v-else trigger="click" @command="handleUserCommand">
            <span class="front-user-chip">
              <el-avatar :size="30" class="front-avatar">{{ userInitial }}</el-avatar>
              <span class="front-user-name">{{ username }}</span>
              <el-icon :size="12"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="mine">{{ t('portal.navMine') }}</el-dropdown-item>
                <el-dropdown-item command="favorites">{{ t('portal.navFavorites') }}</el-dropdown-item>
                <el-dropdown-item command="logout" divided>{{ t('portal.logout') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </header>

    <div class="front-body">
      <!-- 左侧固定侧栏 -->
      <aside class="front-sidebar">
        <div class="side-section-label">{{ t('portal.sideExplore') }}</div>
        <nav class="side-nav" aria-label="主导航">
          <router-link to="/portal/prompts" class="side-nav-item">
            <el-icon><Compass /></el-icon>
            <span>{{ t('portal.navSquare') }}</span>
          </router-link>
          <router-link to="/portal/publish" class="side-nav-item">
            <el-icon><EditPen /></el-icon>
            <span>{{ t('portal.navPublish') }}</span>
          </router-link>
        </nav>

        <div class="side-section-label">{{ t('portal.sideMine') }}</div>
        <nav class="side-nav" aria-label="我的">
          <router-link to="/portal/mine" class="side-nav-item">
            <el-icon><Document /></el-icon>
            <span>{{ t('portal.navMine') }}</span>
          </router-link>
          <router-link to="/portal/favorites" class="side-nav-item">
            <el-icon><Star /></el-icon>
            <span>{{ t('portal.navFavorites') }}</span>
          </router-link>
        </nav>

        <div class="side-bottom">
          <router-link v-if="isAdmin" to="/" class="side-admin-link">
            <el-icon><Setting /></el-icon>
            <span>{{ t('portal.navAdmin') }}</span>
          </router-link>
          <p class="side-tip">{{ t('portal.sideTip') }}</p>
        </div>
      </aside>

      <!-- 右侧内容区 -->
      <main class="front-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowDown, Search, MagicStick, Compass, EditPen, Document, Star, Setting } from '@element-plus/icons-vue'
import { authApi } from '@/api'
import { useUserStore } from '@/stores'
import { useI18n } from '@/i18n'
import './portal.css'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const searchInput = ref('')
const isLoggedIn = computed(() => userStore.isLoggedIn)
// 「后台管理」入口仅对管理员可见，与全局权限判定保持一致
const isAdmin = computed(() => userStore.roles.some((role) => role === 'admin' || role === 'super_admin'))
const username = computed(() => userStore.username || t('portal.login'))
const userInitial = computed(() => username.value.charAt(0).toUpperCase())

watch(
  () => route.query.keyword,
  (value) => {
    searchInput.value = typeof value === 'string' ? value : ''
  },
  { immediate: true },
)

const go = (path: string): void => {
  void router.push(path)
}

const submitSearch = (): void => {
  const keyword = searchInput.value.trim()
  void router.push({ path: '/portal/prompts', query: keyword ? { keyword } : {} })
}

const handleUserCommand = async (command: string): Promise<void> => {
  if (command === 'mine') go('/portal/mine')
  else if (command === 'favorites') go('/portal/favorites')
  else if (command === 'logout') {
    try {
      await authApi.logout()
    } catch {
      // 退出接口异常时仍清理本地登录态
    }
    userStore.logout()
    ElMessage.success(t('portal.logoutSuccess'))
    go('/portal/prompts')
  }
}
</script>

<style scoped>
.front-layout {
  min-height: 100vh;
}

/* 顶部通栏 */
.front-header {
  position: sticky;
  top: 0;
  z-index: 30;
  height: 62px;
  background: var(--card-bg);
  box-shadow: var(--shadow-sm);
}

.front-header-inner {
  width: 100%;
  height: 100%;
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 28px;
}

.front-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
  color: var(--brand);
}

.front-brand-mark {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--brand);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.front-brand-text {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.front-search {
  flex: 1;
  max-width: 620px;
  display: flex;
  gap: 8px;
}

.front-search :deep(.el-input__wrapper) {
  background: var(--page-bg);
  box-shadow: none;
  border: 1px solid var(--line);
}

.front-search :deep(.el-input__wrapper.is-focus) {
  border-color: var(--brand);
  background: #fff;
}

.front-search .el-button {
  padding: 0 18px;
}

.front-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  flex-shrink: 0;
}

.front-register-btn {
  border-radius: var(--radius-pill);
  padding: 0 18px;
}

.front-user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px 4px 4px;
  border-radius: var(--radius-pill);
  transition: background 0.16s;
  font-size: 14px;
}

.front-user-chip:hover {
  background: var(--page-bg);
}

.front-avatar {
  background: var(--brand-gradient);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.front-user-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 侧栏 + 内容：侧栏固定贴合视窗左侧，内容整体右移让出侧栏宽度 */
.front-body {
  display: block;
  width: 100%;
}

.front-sidebar {
  position: fixed;
  left: 0;
  top: 62px;
  bottom: 0;
  z-index: 20;
  width: 196px;
  height: calc(100vh - 62px);
  padding: 22px 14px;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border-right: 1px solid var(--line);
  overflow-y: auto;
}

.side-section-label {
  padding: 0 12px;
  margin: 6px 0 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--ink-3);
}

.side-section-label:not(:first-child) {
  margin-top: 22px;
}

.side-nav {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.side-nav-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  font-size: 14px;
  transition:
    background 0.15s,
    color 0.15s;
}

.side-nav-item:hover {
  background: var(--page-bg);
  color: var(--brand);
}

.side-nav-item.router-link-exact-active {
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: 600;
}

.side-bottom {
  margin-top: auto;
}

.side-admin-link {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  color: var(--ink-2);
  font-size: 14px;
  border-top: 1px solid var(--line);
  padding-top: 16px;
  border-radius: 0;
}

.side-admin-link:hover {
  color: var(--brand);
}

.side-tip {
  margin: 16px 12px 0;
  font-size: 11px;
  line-height: 1.7;
  color: var(--ink-3);
}

.front-main {
  min-width: 0;
  margin-left: 196px;
  padding: 24px;
}

@media (max-width: 900px) {
  .front-header-inner {
    gap: 14px;
    padding: 0 12px;
  }

  .front-brand-text {
    display: none;
  }

  .front-search {
    max-width: none;
  }

  .front-login-link,
  .front-user-name {
    display: none;
  }

  .front-sidebar {
    position: static;
    width: 100%;
    height: auto;
    padding: 10px 12px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .front-sidebar .side-section-label,
  .front-sidebar .side-bottom {
    display: none;
  }

  .front-sidebar .side-nav {
    flex-direction: row;
    gap: 4px;
    overflow-x: auto;
  }

  .front-sidebar .side-nav + .side-nav {
    margin-top: 6px;
  }

  .side-nav-item {
    white-space: nowrap;
    padding: 7px 12px;
  }

  .front-main {
    margin-left: 0;
    padding: 16px 12px;
  }
}
</style>
