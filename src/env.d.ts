/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

declare module 'md-editor-v3' {
  import type { DefineComponent } from 'vue'
  export const MdPreview: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export const MdEditor: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export const config: (options: Record<string, unknown>) => void
}

/**
 * TypeScript 环境变量类型定义
 * Vite 会自动注入 import.meta.env 中的环境变量
 */
interface ImportMetaEnv {
  /** 应用标题 */
  readonly VITE_APP_TITLE: string
  /** 应用描述 */
  readonly VITE_APP_DESCRIPTION: string
  /** API 基础地址 */
  readonly VITE_API_BASE_URL?: string
  /** Sentry 错误监控 DSN（生产环境使用） */
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
