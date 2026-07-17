/**
 * User Store - 用户认证状态管理
 *
 * 职责：
 * - 用户登录态管理（Token、用户信息）
 * - 与 request.ts 的 Token 同步
 * - 强制改密状态
 * - 替代 localStorage 直接读写模式
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { setAccessToken, getAccessToken } from '@/utils/request'
import type { User } from '@/types/api'

export const useUserStore = defineStore('user', () => {
  // ==================== State ====================

  /** 用户信息（与 localStorage 双向同步） */
  const userInfo = ref<User | null>(loadUserFromStorage())

  /** Access Token */
  const token = ref<string | null>(getAccessToken())

  /** 是否需要强制改密 */
  const passwordResetRequired = ref(localStorage.getItem('passwordResetRequired') === 'true')

  // ==================== Getters ====================

  /** 是否已登录 */
  const isLoggedIn = computed(() => !!userInfo.value)

  /** 当前用户名 */
  const username = computed(() => userInfo.value?.nickname || userInfo.value?.username || '')

  /** 用户角色列表 */
  const roles = computed(() => userInfo.value?.roles || [])

  // ==================== Actions ====================

  /**
   * 登录成功后设置用户信息和 Token
   */
  function login(user: User, accessToken: string): void {
    userInfo.value = user
    token.value = accessToken
    setAccessToken(accessToken)
    saveUserToStorage(user)
    localStorage.removeItem('passwordResetRequired')
    passwordResetRequired.value = false
  }

  /**
   * 登出：清除所有登录状态
   */
  function logout(): void {
    userInfo.value = null
    token.value = null
    setAccessToken(null)
    clearUserFromStorage()
    passwordResetRequired.value = false
  }

  /**
   * 更新用户信息
   */
  function updateUserInfo(partial: Partial<User>): void {
    if (userInfo.value) {
      userInfo.value = { ...userInfo.value, ...partial }
      saveUserToStorage(userInfo.value)
    }
  }

  /**
   * 设置 Token（当 Refresh Token 刷新后调用）
   */
  function setToken(newToken: string): void {
    token.value = newToken
    setAccessToken(newToken)
  }

  /**
   * 设置强制改密状态
   */
  function setPasswordResetRequired(required: boolean): void {
    passwordResetRequired.value = required
    if (required) {
      localStorage.setItem('passwordResetRequired', 'true')
    } else {
      localStorage.removeItem('passwordResetRequired')
    }
  }

  /**
   * 从本地存储恢复用户信息
   */
  function restoreFromStorage(): void {
    const saved = loadUserFromStorage()
    if (saved) {
      userInfo.value = saved
    }
    passwordResetRequired.value = localStorage.getItem('passwordResetRequired') === 'true'
  }

  // ==================== 存储辅助函数 ====================

  function saveUserToStorage(user: User): void {
    try {
      localStorage.setItem('user', JSON.stringify(user))
    } catch {
      // localStorage 写入失败（如存储空间不足），忽略
    }
  }

  function loadUserFromStorage(): User | null {
    try {
      const raw = localStorage.getItem('user')
      return raw ? (JSON.parse(raw) as User) : null
    } catch {
      // localStorage 读取或解析失败，返回 null
      return null
    }
  }

  function clearUserFromStorage(): void {
    try {
      localStorage.removeItem('user')
      localStorage.removeItem('passwordResetRequired')
    } catch {
      // localStorage 清理失败，忽略
    }
  }

  return {
    // State
    userInfo,
    token,
    passwordResetRequired,
    // Getters
    isLoggedIn,
    username,
    roles,
    // Actions
    login,
    logout,
    updateUserInfo,
    setToken,
    setPasswordResetRequired,
    restoreFromStorage,
  }
})
