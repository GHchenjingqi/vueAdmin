import { installErrorReporting, reportError } from '@shared/errors/report'
import type { App } from 'vue'

/** P1-T10：客户端全局错误捕获（onerror + unhandledrejection + Vue errorHandler），脱敏后上报 BFF */
export default defineNuxtPlugin((nuxtApp) => {
  installErrorReporting()
  const app = nuxtApp.vueApp as unknown as { errorHandler?: (err: unknown, instance: unknown, info: string) => void }
  app.errorHandler = (err: unknown, _instance: unknown, info: string) => {
    const e = err as Error
    console.error('[vue]', e, info)
    reportError({ message: `${e?.message ?? String(err)} (hook: ${info})`, stack: e?.stack, source: 'vue' })
  }
  void (0 as unknown as App)
})
