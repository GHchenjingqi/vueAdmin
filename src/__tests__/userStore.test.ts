import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '@/stores/userStore'

vi.mock('@/utils/request', () => ({
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(() => null),
}))

describe('userStore', () => {
  const mockUser = {
    id: 1,
    username: 'admin',
    nickname: '管理员',
    email: 'admin@example.com',
    phone: '13800138000',
    status: 1,
    roles: ['admin', 'user'],
    permissions: ['system:user:list', 'system:user:add'],
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('初始状态', () => {
    it('默认未登录', () => {
      const store = useUserStore()
      expect(store.isLoggedIn).toBe(false)
      expect(store.userInfo).toBeNull()
      expect(store.token).toBeNull()
    })

    it('默认用户名和角色为空', () => {
      const store = useUserStore()
      expect(store.username).toBe('')
      expect(store.roles).toEqual([])
    })

    it('默认 passwordResetRequired 为 false', () => {
      const store = useUserStore()
      expect(store.passwordResetRequired).toBe(false)
    })
  })

  describe('login', () => {
    it('登录后设置用户信息和 Token', () => {
      const store = useUserStore()
      store.login(mockUser, 'test-token')

      expect(store.userInfo).toEqual(mockUser)
      expect(store.token).toBe('test-token')
      expect(store.isLoggedIn).toBe(true)
    })

    it('登录后清除 passwordResetRequired', () => {
      const store = useUserStore()
      localStorage.setItem('passwordResetRequired', 'true')
      store.login(mockUser, 'test-token')

      expect(store.passwordResetRequired).toBe(false)
      expect(localStorage.getItem('passwordResetRequired')).toBeNull()
    })

    it('登录后用户信息持久化到 localStorage', () => {
      const store = useUserStore()
      store.login(mockUser, 'test-token')

      const saved = JSON.parse(localStorage.getItem('user') || '{}')
      expect(saved.username).toBe('admin')
    })
  })

  describe('logout', () => {
    it('登出后清除所有状态', () => {
      const store = useUserStore()
      store.login(mockUser, 'test-token')
      store.logout()

      expect(store.userInfo).toBeNull()
      expect(store.token).toBeNull()
      expect(store.isLoggedIn).toBe(false)
      expect(store.passwordResetRequired).toBe(false)
    })

    it('登出后清除 localStorage 用户数据', () => {
      const store = useUserStore()
      store.login(mockUser, 'test-token')
      store.logout()

      expect(localStorage.getItem('user')).toBeNull()
      expect(localStorage.getItem('passwordResetRequired')).toBeNull()
    })
  })

  describe('updateUserInfo', () => {
    it('更新用户信息', () => {
      const store = useUserStore()
      store.login(mockUser, 'test-token')
      store.updateUserInfo({ nickname: '新昵称' })

      expect(store.userInfo?.nickname).toBe('新昵称')
      expect(store.userInfo?.username).toBe('admin')
    })

    it('未登录时 updateUserInfo 不报错', () => {
      const store = useUserStore()
      expect(() => store.updateUserInfo({ nickname: 'test' })).not.toThrow()
    })

    it('更新用户信息后持久化', () => {
      const store = useUserStore()
      store.login(mockUser, 'test-token')
      store.updateUserInfo({ nickname: '新昵称' })

      const saved = JSON.parse(localStorage.getItem('user') || '{}')
      expect(saved.nickname).toBe('新昵称')
    })
  })

  describe('setToken', () => {
    it('设置新 Token', () => {
      const store = useUserStore()
      store.setToken('new-token')

      expect(store.token).toBe('new-token')
    })
  })

  describe('setPasswordResetRequired', () => {
    it('设置强制改密为 true', () => {
      const store = useUserStore()
      store.setPasswordResetRequired(true)

      expect(store.passwordResetRequired).toBe(true)
      expect(localStorage.getItem('passwordResetRequired')).toBe('true')
    })

    it('设置强制改密为 false', () => {
      const store = useUserStore()
      store.setPasswordResetRequired(true)
      store.setPasswordResetRequired(false)

      expect(store.passwordResetRequired).toBe(false)
      expect(localStorage.getItem('passwordResetRequired')).toBeNull()
    })
  })

  describe('username getter', () => {
    it('有 nickname 时返回 nickname', () => {
      const store = useUserStore()
      store.login(mockUser, 'test-token')
      expect(store.username).toBe('管理员')
    })

    it('无 nickname 时返回 username', () => {
      const store = useUserStore()
      store.login({ ...mockUser, nickname: undefined }, 'test-token')
      expect(store.username).toBe('admin')
    })

    it('无用户信息时返回空字符串', () => {
      const store = useUserStore()
      expect(store.username).toBe('')
    })
  })

  describe('restoreFromStorage', () => {
    it('从 localStorage 恢复用户信息', () => {
      localStorage.setItem('user', JSON.stringify(mockUser))
      localStorage.setItem('passwordResetRequired', 'true')

      const store = useUserStore()
      store.restoreFromStorage()

      expect(store.userInfo?.username).toBe('admin')
      expect(store.passwordResetRequired).toBe(true)
    })

    it('无 localStorage 数据时保持 null', () => {
      const store = useUserStore()
      store.restoreFromStorage()

      expect(store.userInfo).toBeNull()
    })
  })
})
