/**
 * 防抖（debounce）工具函数
 *
 * 延迟执行，如果在延迟期间再次调用则重置计时器。
 * 适用于搜索输入、窗口 resize 等场景。
 *
 * @param fn 要防抖的函数
 * @param delay 延迟时间（毫秒），默认 300ms
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay = 300): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn(...args)
      timer = null
    }, delay)
  }
}

/**
 * 节流（throttle）工具函数
 *
 * 在指定时间间隔内最多执行一次。
 * 适用于滚动事件、按钮点击防重复提交等场景。
 *
 * @param fn 要节流的函数
 * @param interval 时间间隔（毫秒），默认 300ms
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: unknown[]) => void>(fn: T, interval = 300): (...args: Parameters<T>) => void {
  let lastTime = 0
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastTime >= interval) {
      lastTime = now
      fn(...args)
    }
  }
}
