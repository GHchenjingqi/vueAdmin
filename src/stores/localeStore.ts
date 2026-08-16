/**
 * Locale Store - 国际化语言配置管理
 *
 * 职责：
 * - 当前语言管理
 * - 配置持久化（使用 pinia-plugin-persistedstate）
 * - 与 i18n/index.ts 的 currentLocale 保持同步
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { setLocale as setI18nLocale } from '@/i18n'

export type LocaleKey = 'zh-CN' | 'en-US'

function isLocaleKey(value: unknown): value is LocaleKey {
  return value === 'zh-CN' || value === 'en-US'
}

/**
 * 兼容历史存储：
 * - pinia 标准：'{"locale":"en-US"}'
 * - 旧 i18n 明文：'en-US'
 */
function deserializeLocaleState(value: string): { locale: LocaleKey } {
  if (isLocaleKey(value)) {
    return { locale: value }
  }
  try {
    const parsed = JSON.parse(value) as { locale?: unknown } | null
    if (parsed && isLocaleKey(parsed.locale)) {
      return { locale: parsed.locale }
    }
  } catch {
    // ignore invalid cache
  }
  return { locale: 'zh-CN' }
}

export const useLocaleStore = defineStore(
  'locale',
  () => {
    // ==================== State ====================

    const locale = ref<LocaleKey>('zh-CN')

    // ==================== Actions ====================

    function setLocale(l: LocaleKey): void {
      if (!isLocaleKey(l)) return
      locale.value = l
      document.documentElement.setAttribute('lang', l)
      setI18nLocale(l)
    }

    function reset(): void {
      locale.value = 'zh-CN'
      document.documentElement.setAttribute('lang', 'zh-CN')
      setI18nLocale('zh-CN')
    }

    return {
      // State
      locale,
      // Actions
      setLocale,
      reset,
    }
  },
  {
    persist: {
      key: 'locale',
      storage: localStorage,
      pick: ['locale'],
      serializer: {
        serialize: JSON.stringify,
        deserialize: deserializeLocaleState,
      },
      afterHydrate: (ctx) => {
        // 持久化恢复后立即同步到 i18n 运行时，避免等待 App.onMounted
        const restored = ctx.store.locale as LocaleKey
        if (isLocaleKey(restored)) {
          setI18nLocale(restored)
          if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('lang', restored)
          }
        }
      },
    },
  },
)
