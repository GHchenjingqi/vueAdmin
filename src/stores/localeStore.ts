/**
 * Locale Store - 国际化语言配置管理
 *
 * 职责：
 * - 当前语言管理
 * - 配置持久化（使用 pinia-plugin-persistedstate）
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type LocaleKey = 'zh-CN' | 'en-US'

export const useLocaleStore = defineStore(
  'locale',
  () => {
    // ==================== State ====================

    const locale = ref<LocaleKey>('zh-CN')

    // ==================== Actions ====================

    function setLocale(l: LocaleKey): void {
      locale.value = l
      document.documentElement.setAttribute('lang', l)
    }

    function reset(): void {
      locale.value = 'zh-CN'
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
      key: 'localeStore',
      storage: localStorage,
      pick: ['locale'],
    },
  },
)
