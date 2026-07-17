import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'

vi.mock('@element-plus/icons-vue', () => ({
  Lock: { name: 'Lock', render: () => null },
  Unlock: { name: 'Unlock', render: () => null },
  DocumentAdd: { name: 'DocumentAdd', render: () => null },
  Files: { name: 'Files', render: () => null },
}))

import { getIconComponent, loadIcon, loadIcons, iconRegistry } from '@/utils/dynamicIcons'

describe('dynamicIcons', () => {
  describe('getIconComponent', () => {
    it('返回存在的图标组件', async () => {
      const component = await getIconComponent('Lock')

      expect(component).toBeDefined()
      expect(component?.name).toBe('Lock')
    })

    it('不存在的图标返回 null', async () => {
      const component = await getIconComponent('NonExistentIcon')

      expect(component).toBeNull()
    })
  })

  describe('loadIcon', () => {
    it('加载并注册图标到 registry', async () => {
      await loadIcon('Unlock')
      await nextTick()

      expect(iconRegistry.value).toHaveProperty('Unlock')
      expect(iconRegistry.value.Unlock).toBeDefined()
    })

    it('重复加载不会重复请求', async () => {
      await loadIcon('DocumentAdd')
      await loadIcon('DocumentAdd')
      await nextTick()

      expect(iconRegistry.value).toHaveProperty('DocumentAdd')
    })

    it('不存在的图标不注册', async () => {
      await loadIcon('DefinitelyNotAnIcon')
      await nextTick()

      expect(iconRegistry.value).not.toHaveProperty('DefinitelyNotAnIcon')
    })
  })

  describe('loadIcons', () => {
    it('批量加载多个图标', async () => {
      await loadIcons(['Files'])
      await nextTick()

      expect(iconRegistry.value).toHaveProperty('Files')
    })

    it('空数组不报错', async () => {
      await expect(loadIcons([])).resolves.toBeUndefined()
    })
  })

  describe('iconRegistry', () => {
    it('是响应式对象', () => {
      expect(iconRegistry).toBeDefined()
      expect(typeof iconRegistry.value).toBe('object')
    })
  })
})
