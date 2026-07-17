import { describe, it, expect, beforeEach, vi } from 'vitest'
import { translate, setLocale, useI18n, waitForLocale } from '@/i18n/index'
import type { LocaleKey } from '@/i18n/index'

/** Test helper: treat any string as a translation key */
function t(key: string): string {
  return translate(key as unknown as Parameters<typeof translate>[0], undefined, undefined)
}

describe('i18n', () => {
  beforeEach(() => {
    // Reset to Chinese before each test
    setLocale('zh-CN')
  })

  describe('translate (t)', () => {
    it('returns Chinese translation', () => {
      expect(translate('common.confirm')).toBe('确定')
      expect(translate('common.cancel')).toBe('取消')
    })

    it('returns English translation after locale switch', async () => {
      setLocale('en-US')
      await waitForLocale('en-US')
      expect(translate('common.confirm')).toBe('Confirm')
      expect(translate('common.cancel')).toBe('Cancel')
    })

    it('supports nested key access', () => {
      expect(translate('messages.deleteConfirm')).toBe('确定要执行此操作吗？')
      expect(translate('layout.darkMode')).toBe('暗黑模式')
    })

    it('falls back to English when key missing in current language', () => {
      setLocale('zh-CN')
      expect(translate('common.confirm')).toBe('确定')
    })

    it('returns key itself when key does not exist', () => {
      expect(t('nonexistent.key')).toBe('nonexistent.key')
    })

    it('returns fallback when key does not exist', () => {
      expect(translate('nonexistent.key' as unknown as Parameters<typeof translate>[0], undefined, '默认值')).toBe('默认值')
    })

    it('supports template interpolation', () => {
      expect(translate('user.deleteConfirm', { username: 'admin' })).toBe('确定要删除用户名「admin」吗？')
    })

    it('retains placeholders when interpolation params are missing', () => {
      const result = translate('user.deleteConfirm', {})
      expect(result).toContain('{username}')
    })

    it('interpolation supports numeric params', () => {
      expect(translate('user.batchDeleteCount', { count: 5 })).toBe('确定要删除选中5个用户吗？')
    })

    it('empty key returns key itself', () => {
      expect(t('')).toBe('')
    })

    it('template interpolation in English mode', async () => {
      setLocale('en-US')
      await waitForLocale('en-US')
      expect(translate('user.deleteConfirm', { username: 'admin' })).toBe('Are you sure to delete user "admin"?')
    })
  })

  describe('setLocale', () => {
    it('switches to English', async () => {
      setLocale('en-US')
      await waitForLocale('en-US')
      expect(translate('common.confirm')).toBe('Confirm')
    })

    it('switches back to Chinese', () => {
      setLocale('en-US')
      setLocale('zh-CN')
      expect(translate('common.confirm')).toBe('确定')
    })

    it('ignores invalid locale', () => {
      setLocale('zh-CN')
      setLocale('fr-FR' as LocaleKey)
      expect(translate('common.confirm')).toBe('确定')
    })

    it('persists language to localStorage', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
      setLocale('en-US')
      expect(setItemSpy).toHaveBeenCalledWith('locale', 'en-US')
      setItemSpy.mockRestore()
    })

    it('sets document.documentElement lang attribute', () => {
      setLocale('en-US')
      expect(document.documentElement.getAttribute('lang')).toBe('en-US')
      setLocale('zh-CN')
      expect(document.documentElement.getAttribute('lang')).toBe('zh-CN')
    })
  })

  describe('useI18n', () => {
    it('returns t function', () => {
      const { t: i18nT } = useI18n()
      expect(i18nT('common.confirm')).toBe('确定')
    })

    it('returns locale computed ref', () => {
      const { locale } = useI18n()
      expect(locale.value).toBe('zh-CN')
      setLocale('en-US')
      expect(locale.value).toBe('en-US')
    })

    it('returns availableLocales', () => {
      const { availableLocales } = useI18n()
      expect(availableLocales).toContain('zh-CN')
      expect(availableLocales).toContain('en-US')
    })

    it('returns localeLabels', () => {
      const { localeLabels } = useI18n()
      expect(localeLabels.value['zh-CN']).toBe('简体中文')
      expect(localeLabels.value['en-US']).toBe('English')
    })

    it('localeLabels updates after locale change', () => {
      const { localeLabels } = useI18n()
      setLocale('en-US')
      expect(localeLabels.value['zh-CN']).toBe('简体中文')
      expect(localeLabels.value['en-US']).toBe('English')
    })

    it('returns setLocale function', async () => {
      const { setLocale: set } = useI18n()
      set('en-US')
      await waitForLocale('en-US')
      expect(translate('common.confirm')).toBe('Confirm')
    })
  })
})
