/**
 * Setting Store - 系统设置缓存管理
 *
 * 职责：
 * - 缓存系统设置（key-value 键值对）
 * - 水印配置管理
 * - 避免重复请求
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { settingApi } from '@/api/setting'

export interface WatermarkConfig {
  enabled: boolean
  text: string
}

export const useSettingStore = defineStore('setting', () => {
  // ==================== State ====================

  /** 系统设置键值对 */
  const settings = ref<Record<string, unknown>>({})

  /** 是否已加载 */
  const loaded = ref(false)

  /** 加载中 */
  const loading = ref(false)

  // ==================== Getters ====================

  /** 水印配置 */
  const watermark = computed<WatermarkConfig>(() => ({
    enabled: settings.value.watermark_enabled === true || settings.value.watermark_enabled === 'true',
    text: (settings.value.watermark_text as string) || '',
  }))

  /** 是否开启验证码 */
  const captchaEnabled = computed(() => settings.value.captcha_enabled === true || settings.value.captcha_enabled === 'true')

  /** 获取单个设置值 */
  function get(key: string): unknown {
    return settings.value[key]
  }

  /** 获取字符串设置值 */
  function getString(key: string, defaultValue = ''): string {
    const val = settings.value[key]
    return val ? String(val) : defaultValue
  }

  /** 获取布尔设置值 */
  function getBoolean(key: string, defaultValue = false): boolean {
    const val = settings.value[key]
    if (val === undefined || val === null) return defaultValue
    return val === true || val === 'true' || val === 1 || val === '1'
  }

  // ==================== Actions ====================

  /**
   * 加载所有设置
   */
  async function loadSettings(): Promise<void> {
    if (loading.value) return
    loading.value = true
    try {
      const res = await settingApi.list()
      if (res.data) {
        settings.value = res.data as Record<string, unknown>
        loaded.value = true
      }
    } catch {
      // 失败时保持旧数据
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存设置
   */
  async function saveSettings(data: Record<string, unknown>): Promise<boolean> {
    try {
      await settingApi.save(data)
      // 合并到本地缓存
      settings.value = { ...settings.value, ...data }
      return true
    } catch {
      return false
    }
  }

  /**
   * 更新单个设置
   */
  function setSetting(key: string, value: unknown): void {
    settings.value[key] = value
  }

  /**
   * 重置设置缓存（登出时调用）
   */
  function reset(): void {
    settings.value = {}
    loaded.value = false
    loading.value = false
  }

  return {
    // State
    settings,
    loaded,
    loading,
    // Getters
    watermark,
    captchaEnabled,
    get,
    getString,
    getBoolean,
    // Actions
    loadSettings,
    saveSettings,
    setSetting,
    reset,
  }
})
