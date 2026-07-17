/**
 * 轻量级国际化（i18n）工具
 *
 * 使用方式：
 *   const { t } = useI18n()
 *   console.log(t('common.confirm')) // => '确定'
 *   console.log(t('messages.deleteConfirm')) // => '确定要执行此操作吗？'
 *
 * 加载策略：
 *   - zh-CN（默认语言）：静态同步导入，首屏已加载
 *   - en-US：首次切换语言时异步加载（约 30KB），后续直接读缓存
 */
import { ref, computed } from 'vue'
import zhCN from './zh-CN.json'

export type LocaleKey = 'zh-CN' | 'en-US'

/** 中文消息结构的类型，用于编译期校验翻译 key */
export type MessageSchema = typeof zhCN extends { default: infer T } ? T : typeof zhCN

/** 消息缓存（运行时存储） */
const messageCache: Record<LocaleKey, MessageSchema | null> = {
  'zh-CN': zhCN,
  'en-US': null,
}

/** Vite 静态可分析的动态导入映射（避免变量路径导致无法打包） */
const localeLoaders: Record<LocaleKey, () => Promise<{ default: MessageSchema }>> = {
  'zh-CN': () => import('./zh-CN.json'),
  'en-US': () => import('./en-US.json'),
}

/** 正在加载中的 promise（防止并发重复加载） */
const loadingPromises: Partial<Record<LocaleKey, Promise<MessageSchema>>> = {}

// 当前语言
const currentLocale = ref<LocaleKey>((typeof localStorage !== 'undefined' ? (localStorage.getItem('locale') as LocaleKey | null) : null) || 'zh-CN')

/**
 * 异步加载语言包到缓存（仅 en-US 需要，zh-CN 已在构建时同步加载）
 */
async function loadMessages(locale: LocaleKey): Promise<MessageSchema> {
  if (messageCache[locale] !== null) {
    return messageCache[locale]!
  }

  if (loadingPromises[locale]) {
    return loadingPromises[locale]!
  }

  const promise = (async () => {
    const messages = await localeLoaders[locale]()
    messageCache[locale] = messages.default
    return messages.default
  })()

  loadingPromises[locale] = promise
  return promise
}

/**
 * 切换语言
 *
 * zh-CN：同步完成（已预加载）
 * en-US：首次切换时异步加载；后续切换直接读缓存（同步）
 */
export function setLocale(locale: LocaleKey): void {
  if (!['zh-CN', 'en-US'].includes(locale)) return

  currentLocale.value = locale
  try {
    localStorage.setItem('locale', locale)
  } catch {
    // 忽略存储失败
  }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', locale)
  }

  // 预加载非默认语言（静默，不阻塞 UI）
  if (locale === 'en-US' && messageCache['en-US'] === null) {
    loadMessages(locale).catch(() => {
      // 静默失败，保持 zh-CN 兜底
    })
  }
}

/**
 * 等待指定语言包加载完成（测试用工具函数）
 *
 * 在测试环境中，动态 import() 可能需要等待 microtask 队列清空。
 * 此函数轮询等待缓存就绪，最长等待 500ms 后超时。
 */
export async function waitForLocale(locale: LocaleKey): Promise<void> {
  if (messageCache[locale] !== null) return

  const start = Date.now()
  const TIMEOUT = 2000 // jsdom 环境下动态 import 可能较慢，适当放宽
  while (messageCache[locale] === null) {
    if (Date.now() - start > TIMEOUT) {
      throw new Error(`waitForLocale('${locale}'): 超时（${TIMEOUT}ms）`)
    }
    // 等待一个 microtask
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/**
 * 通过路径访问对象属性，如 'common.confirm' => obj.common.confirm
 */
function getByPath(obj: MessageSchema | Record<string, unknown> | null, path: string): string | undefined {
  if (!obj || !path) return undefined
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === undefined || current === null) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'string' ? current : undefined
}

/**
 * 模板插值：将 {name} 替换为参数对应值
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = params[key]
    return val !== undefined ? String(val) : `{${key}}`
  })
}

/**
 * 翻译函数：按键查找字符串，支持插值和回退
 *
 * 回退策略：
 *   1. 优先返回当前语言值
 *   2. 当前语言未加载（en-US 首次）则尝试中文兜底
 *   3. 最后返回 key 本身或 fallback 参数
 *
 * 注意：en-US 首次切换时可能尚未加载完成，此时 t() 会读到中文兜底值。
 *       加载完成后 UI 会通过 Vue 的响应式自动更新（locale change 触发 re-render）。
 */
export function translate(key: string, params?: Record<string, string | number>, fallback?: string): string {
  const msg = messageCache[currentLocale.value]
  const value = getByPath(msg, key)
  if (value !== undefined) {
    return interpolate(value, params)
  }

  // 当前语言未加载时，兜底到默认语言（zh-CN）
  const fallbackLocale: LocaleKey = currentLocale.value === 'zh-CN' ? 'en-US' : 'zh-CN'
  const fallbackMsg = messageCache[fallbackLocale]
  if (fallbackMsg) {
    const fallbackValue = getByPath(fallbackMsg, key)
    if (fallbackValue !== undefined) {
      return interpolate(fallbackValue, params)
    }
  }

  return fallback ?? key
}

/**
 * Vue 组合式 API：在组件中使用
 *
 * localeLabels: 每种语言在下拉选择器中的显示名称
 */
export function useI18n() {
  const localeLabels = computed<Record<string, string>>(() => {
    const msg = messageCache[currentLocale.value]
    const labels = msg && (msg as Record<string, unknown>).locale
    if (labels && typeof labels === 'object') {
      return labels as Record<string, string>
    }
    // 兜底：返回 zh-CN 的 locale 键
    const zhLabels = (messageCache['zh-CN'] as Record<string, unknown>)?.locale as Record<string, string>
    return zhLabels ?? {}
  })

  return {
    /** 翻译函数，同步调用 */
    t: translate,
    /** 当前语言 Ref */
    locale: computed(() => currentLocale.value),
    /** 语言选择器显示标签 */
    localeLabels,
    /** 切换语言 */
    setLocale,
    /** 可用语言列表 */
    availableLocales: ['zh-CN', 'en-US'] as LocaleKey[],
  }
}

// 默认导出：方便按需引入
export default {
  useI18n,
  translate,
  setLocale,
}
