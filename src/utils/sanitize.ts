/**
 * SVG 内容清理工具
 *
 * 用于在 v-html 渲染前去除后端返回 SVG 中的潜在危险内容，
 * 防止 XSS 攻击（script 标签、事件处理器等）。
 */

/**
 * 清理 SVG 字符串，移除危险的标签和属性
 * - 移除 <script> 标签及其内容
 * - 移除所有 on* 事件属性（onclick, onload 等）
 * - 移除 javascript: 协议的 href/xlink:href
 */
export function sanitizeSvg(svg: string): string {
  if (!svg) return ''

  return (
    svg
      // 移除 <script> 标签及内容
      .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
      // 移除 on* 事件属性（如 onclick="..."、onerror='...'）
      .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
      // 移除 javascript: 协议的 href / xlink:href
      .replace(/\s+(?:xlink:)?href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '')
  )
}
