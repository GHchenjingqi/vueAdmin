/**
 * 单语站（P5-T01b）：URL 无语言前缀，locale 由后台 store config 决定。
 * 此中间件不再做前缀检测/cookie/响应头写入；保留文件仅为兼容旧 import，无副作用。
 * requestId 兜底由 00-request-id 承担。
 */
export default defineEventHandler(() => {})
