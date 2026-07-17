/**
 * NProgress 进度条配置
 *
 * 在路由跳转和 API 请求时显示顶部进度条，
 * 提供视觉反馈，提升用户体验。
 *
 * 优化：延迟启动，避免快速操作闪烁
 */
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

NProgress.configure({
  easing: 'ease',
  speed: 500,
  showSpinner: false,
  trickleSpeed: 200,
  minimum: 0.08,
})

/** 活跃请求计数，用于合并多个并发请求的进度条 */
let activeRequests = 0

/** 延迟启动定时器 */
let startTimer: ReturnType<typeof setTimeout> | null = null

/** 延迟启动阈值（毫秒），避免快速操作闪烁 */
const START_DELAY = 200

/** 启动进度条（延迟启动） */
export function startProgress(): void {
  if (activeRequests === 0 && !startTimer) {
    // 延迟启动，避免快速操作闪烁
    startTimer = setTimeout(() => {
      NProgress.start()
      startTimer = null
    }, START_DELAY)
  }
  activeRequests++
}

/** 完成进度条 */
export function doneProgress(): void {
  activeRequests = Math.max(0, activeRequests - 1)
  if (activeRequests === 0) {
    // 清除未启动的定时器
    if (startTimer) {
      clearTimeout(startTimer)
      startTimer = null
    } else {
      NProgress.done()
    }
  }
}

/** 强制完成（用于错误场景） */
export function forceDoneProgress(): void {
  activeRequests = 0
  if (startTimer) {
    clearTimeout(startTimer)
    startTimer = null
  }
  NProgress.done()
}

export { NProgress }
