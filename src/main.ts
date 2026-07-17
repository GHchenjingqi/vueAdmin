import { createApp } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
// Element Plus CSS：暗黑模式 CSS 变量（必须），完整样式由 unplugin-vue-components
// 按组件异步导入（importStyle: 'sass'），节省首屏 CSS ~450KB
import 'element-plus/theme-chalk/src/dark/css-vars.scss'
import 'element-plus/theme-chalk/src/message.scss'
import 'element-plus/theme-chalk/src/message-box.scss'
import './assets/theme.scss'
import App from './App.vue'
import router from './router'
import { pinia } from './stores/pinia'
import { vPermission } from './directives/permission'
import 'nprogress/nprogress.css'
import * as Sentry from '@sentry/vue'
import { reportWebVitals } from './utils/webVitals'
const app = createApp(App)

// 图标注册策略：在 LayoutSidebar 渲染菜单时按需注册（见 dynamicIcons.ts）
// 避免全量注册 300+ 图标到 Vue 实例，提升启动性能和内存使用

app.use(pinia)
// 注册 v-permission 指令
app.directive('permission', vPermission)
// Element Plus 组件由 unplugin-vue-components 按需自动导入，无需全量 app.use()
// 仅通过 provide 传递 locale 配置，供 ElConfigProvider 使用
app.provide('element-plus-locale', zhCn)
app.use(router)

// 错误监控 Sentry（生产环境启用）
if (import.meta.env.PROD) {
  Sentry.init({
    app,
    dsn: import.meta.env.VITE_SENTRY_DSN || '',
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
      Sentry.httpClientIntegration(), // 监控 API 请求性能
      Sentry.reportingObserverIntegration(), // 捕获 ReportingObserver
    ],
    // 性能采样率 - 提升到 0.5
    tracesSampleRate: 0.5,
    // 自定义性能指标
    tracePropagationTargets: ['localhost', /^https:\/\/api\./],
    // Session 回放采样率
    replaysSessionSampleRate: 0.1,
    // 错误时总是回放
    replaysOnErrorSampleRate: 1.0,
  })

  // 上报 Web Vitals
  reportWebVitals()
}

app.mount('#app')
