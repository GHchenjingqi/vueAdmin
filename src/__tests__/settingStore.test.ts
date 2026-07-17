import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingStore } from '@/stores/settingStore'

vi.mock('@/api/setting', () => ({
  settingApi: {
    list: vi.fn(),
    save: vi.fn(),
  },
}))

import { settingApi } from '@/api/setting'

describe('settingStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('初始状态', () => {
    it('默认设置对象为空', () => {
      const store = useSettingStore()
      expect(store.settings).toEqual({})
      expect(store.loaded).toBe(false)
      expect(store.loading).toBe(false)
    })
  })

  describe('loadSettings', () => {
    it('成功加载设置', async () => {
      const mockSettings = {
        watermark_enabled: true,
        watermark_text: '测试水印',
        captcha_enabled: 'true',
        site_title: '管理系统',
      }
      vi.mocked(settingApi.list).mockResolvedValue({
        code: 0,
        data: mockSettings,
      })

      const store = useSettingStore()
      await store.loadSettings()

      expect(store.settings).toEqual(mockSettings)
      expect(store.loaded).toBe(true)
    })

    it('加载失败时保持旧数据', async () => {
      vi.mocked(settingApi.list).mockRejectedValue(new Error('网络错误'))

      const store = useSettingStore()
      await store.loadSettings()

      expect(store.settings).toEqual({})
      expect(store.loaded).toBe(false)
    })

    it('重复调用不会重复请求', async () => {
      vi.mocked(settingApi.list).mockResolvedValue({
        code: 0,
        data: {},
      })

      const store = useSettingStore()
      store.loading = true
      await store.loadSettings()

      expect(settingApi.list).not.toHaveBeenCalled()
    })
  })

  describe('saveSettings', () => {
    it('保存设置成功', async () => {
      vi.mocked(settingApi.save).mockResolvedValue({
        code: 0,
        data: null,
      })

      const store = useSettingStore()
      const result = await store.saveSettings({ site_title: '新标题' })

      expect(result).toBe(true)
      expect(store.settings.site_title).toBe('新标题')
    })

    it('保存设置失败', async () => {
      vi.mocked(settingApi.save).mockRejectedValue(new Error('保存失败'))

      const store = useSettingStore()
      const result = await store.saveSettings({ site_title: '新标题' })

      expect(result).toBe(false)
    })
  })

  describe('setSetting', () => {
    it('更新单个设置', () => {
      const store = useSettingStore()
      store.setSetting('theme', 'dark')

      expect(store.settings.theme).toBe('dark')
    })
  })

  describe('watermark getter', () => {
    it('水印启用时返回正确配置', () => {
      const store = useSettingStore()
      store.setSetting('watermark_enabled', true)
      store.setSetting('watermark_text', '机密文件')

      expect(store.watermark.enabled).toBe(true)
      expect(store.watermark.text).toBe('机密文件')
    })

    it('水印禁用时返回 false', () => {
      const store = useSettingStore()
      store.setSetting('watermark_enabled', false)

      expect(store.watermark.enabled).toBe(false)
    })

    it('水印启用为字符串 "true" 时返回 true', () => {
      const store = useSettingStore()
      store.setSetting('watermark_enabled', 'true')

      expect(store.watermark.enabled).toBe(true)
    })

    it('无水印配置时使用默认值', () => {
      const store = useSettingStore()
      expect(store.watermark.enabled).toBe(false)
      expect(store.watermark.text).toBe('')
    })
  })

  describe('captchaEnabled getter', () => {
    it('captcha_enabled 为 true 时返回 true', () => {
      const store = useSettingStore()
      store.setSetting('captcha_enabled', true)

      expect(store.captchaEnabled).toBe(true)
    })

    it('captcha_enabled 为字符串 "true" 时返回 true', () => {
      const store = useSettingStore()
      store.setSetting('captcha_enabled', 'true')

      expect(store.captchaEnabled).toBe(true)
    })

    it('captcha_enabled 为 false 时返回 false', () => {
      const store = useSettingStore()
      store.setSetting('captcha_enabled', false)

      expect(store.captchaEnabled).toBe(false)
    })
  })

  describe('get', () => {
    it('获取单个设置值', () => {
      const store = useSettingStore()
      store.setSetting('key1', 'value1')

      expect(store.get('key1')).toBe('value1')
    })

    it('不存在的 key 返回 undefined', () => {
      const store = useSettingStore()
      expect(store.get('nonexistent')).toBeUndefined()
    })
  })

  describe('getString', () => {
    it('获取字符串设置值', () => {
      const store = useSettingStore()
      store.setSetting('title', '管理系统')

      expect(store.getString('title')).toBe('管理系统')
    })

    it('不存在时返回默认值', () => {
      const store = useSettingStore()
      expect(store.getString('nonexistent', '默认')).toBe('默认')
    })

    it('数字值转为字符串', () => {
      const store = useSettingStore()
      store.setSetting('count', 42)

      expect(store.getString('count')).toBe('42')
    })
  })

  describe('getBoolean', () => {
    it('true 值返回 true', () => {
      const store = useSettingStore()
      store.setSetting('flag', true)

      expect(store.getBoolean('flag')).toBe(true)
    })

    it('字符串 "true" 返回 true', () => {
      const store = useSettingStore()
      store.setSetting('flag', 'true')

      expect(store.getBoolean('flag')).toBe(true)
    })

    it('数字 1 返回 true', () => {
      const store = useSettingStore()
      store.setSetting('flag', 1)

      expect(store.getBoolean('flag')).toBe(true)
    })

    it('字符串 "1" 返回 true', () => {
      const store = useSettingStore()
      store.setSetting('flag', '1')

      expect(store.getBoolean('flag')).toBe(true)
    })

    it('false 值返回 false', () => {
      const store = useSettingStore()
      store.setSetting('flag', false)

      expect(store.getBoolean('flag')).toBe(false)
    })

    it('不存在时返回默认值', () => {
      const store = useSettingStore()
      expect(store.getBoolean('nonexistent', true)).toBe(true)
    })
  })

  describe('reset', () => {
    it('重置所有设置', () => {
      const store = useSettingStore()
      store.setSetting('theme', 'dark')
      store.loaded = true
      store.loading = true

      store.reset()

      expect(store.settings).toEqual({})
      expect(store.loaded).toBe(false)
      expect(store.loading).toBe(false)
    })
  })
})
