import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMenuStore } from '@/stores/menuStore'
import type { Menu } from '@/types/api'

vi.mock('@/api/menu', () => ({
  menuApi: {
    getTree: vi.fn(),
  },
}))

import { menuApi } from '@/api/menu'

const mockMenuTree: Menu[] = [
  {
    id: 1,
    name: '系统管理',
    type: 'M',
    path: '/system',
    status: 1,
    visible: true,
    children: [
      {
        id: 2,
        name: '用户管理',
        type: 'C',
        path: '/system/user',
        status: 1,
        visible: true,
      },
      {
        id: 3,
        name: '用户添加',
        type: 'F',
        permission: 'system:user:add',
        status: 1,
      },
    ],
  },
  {
    id: 4,
    name: '隐藏菜单',
    type: 'M',
    path: '/hidden',
    status: 1,
    visible: false,
  },
  {
    id: 5,
    name: '停用菜单',
    type: 'M',
    path: '/disabled',
    status: 0,
    visible: true,
  },
]

describe('menuStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('初始状态', () => {
    it('默认菜单树为空', () => {
      const store = useMenuStore()
      expect(store.menuTree).toEqual([])
      expect(store.flatMenus).toEqual([])
      expect(store.hasMenus).toBe(false)
    })

    it('默认 loading 为 false', () => {
      const store = useMenuStore()
      expect(store.loading).toBe(false)
    })

    it('默认 activePath 为空', () => {
      const store = useMenuStore()
      expect(store.activePath).toBe('')
    })
  })

  describe('fetchMenus', () => {
    it('成功获取菜单树', async () => {
      const mock = vi.mocked(menuApi.getTree).mockResolvedValue({
        code: 0,
        data: mockMenuTree,
      })

      const store = useMenuStore()
      await store.fetchMenus()

      expect(store.menuTree).toEqual(mockMenuTree)
      expect(store.flatMenus.length).toBeGreaterThan(0)
      expect(store.hasMenus).toBe(true)
      expect(mock).toHaveBeenCalledTimes(1)
    })

    it('获取菜单失败时保持空数组', async () => {
      vi.mocked(menuApi.getTree).mockRejectedValue(new Error('网络错误'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const store = useMenuStore()
      await store.fetchMenus()

      expect(store.menuTree).toEqual([])
      expect(store.flatMenus).toEqual([])

      consoleSpy.mockRestore()
    })

    it('重复调用不会重复请求', async () => {
      vi.mocked(menuApi.getTree).mockResolvedValue({
        code: 0,
        data: mockMenuTree,
      })

      const store = useMenuStore()
      store.loading = true
      await store.fetchMenus()

      expect(menuApi.getTree).not.toHaveBeenCalled()
    })
  })

  describe('setMenus', () => {
    it('直接设置菜单树', () => {
      const store = useMenuStore()
      store.setMenus(mockMenuTree)

      expect(store.menuTree).toEqual(mockMenuTree)
      expect(store.flatMenus.length).toBeGreaterThan(0)
    })
  })

  describe('setActivePath', () => {
    it('设置当前激活路径', () => {
      const store = useMenuStore()
      store.setActivePath('/system/user')
      expect(store.activePath).toBe('/system/user')
    })
  })

  describe('visibleMenus getter', () => {
    it('过滤隐藏和停用的菜单', () => {
      const store = useMenuStore()
      store.setMenus(mockMenuTree)

      const visible = store.visibleMenus
      expect(visible.length).toBe(1)
      expect(visible[0].name).toBe('系统管理')
    })
  })

  describe('currentMenuTitle getter', () => {
    it('找到当前激活菜单的标题', () => {
      const store = useMenuStore()
      store.setMenus(mockMenuTree)
      store.setActivePath('/system/user')

      expect(store.currentMenuTitle).toBe('用户管理')
    })

    it('路径不存在时返回空字符串', () => {
      const store = useMenuStore()
      store.setMenus(mockMenuTree)
      store.setActivePath('/nonexistent')

      expect(store.currentMenuTitle).toBe('')
    })
  })

  describe('permissionMap getter', () => {
    it('构建按钮权限映射', () => {
      const store = useMenuStore()
      store.setMenus(mockMenuTree)

      const map = store.permissionMap
      expect(map['system:user:add']).toBe(true)
    })

    it('不包含非按钮类型的菜单', () => {
      const store = useMenuStore()
      store.setMenus(mockMenuTree)

      const map = store.permissionMap
      expect(map['system:user:list']).toBeUndefined()
    })
  })

  describe('hasPermission', () => {
    it('存在的权限返回 true', () => {
      const store = useMenuStore()
      store.setMenus(mockMenuTree)

      expect(store.hasPermission('system:user:add')).toBe(true)
    })

    it('不存在的权限返回 false', () => {
      const store = useMenuStore()
      store.setMenus(mockMenuTree)

      expect(store.hasPermission('system:user:delete')).toBe(false)
    })
  })

  describe('findFirstMenuPath', () => {
    it('找到第一个可用菜单路径', () => {
      const store = useMenuStore()
      store.setMenus(mockMenuTree)

      const path = store.findFirstMenuPath()
      expect(path).toBe('/system')
    })

    it('无菜单时返回 null', () => {
      const store = useMenuStore()
      expect(store.findFirstMenuPath()).toBeNull()
    })
  })

  describe('findParentPaths', () => {
    it('找到菜单的父级路径链', () => {
      const store = useMenuStore()
      store.setMenus(mockMenuTree)

      const paths = store.findParentPaths('/system/user')
      expect(paths).toContain('/system')
    })

    it('路径不存在时返回空数组', () => {
      const store = useMenuStore()
      store.setMenus(mockMenuTree)

      expect(store.findParentPaths('/nonexistent')).toEqual([])
    })
  })

  describe('clearMenus', () => {
    it('清理所有菜单数据', () => {
      const store = useMenuStore()
      store.setMenus(mockMenuTree)
      store.setActivePath('/system/user')
      store.clearMenus()

      expect(store.menuTree).toEqual([])
      expect(store.flatMenus).toEqual([])
      expect(store.activePath).toBe('')
    })
  })
})
