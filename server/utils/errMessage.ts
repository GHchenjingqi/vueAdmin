/**
 * 统一的未知错误信息提取（供 catch 块替代「err 标注为 any」的写法）
 *
 * 背景：strict 模式下 catch 变量本就是 unknown，显式给它标注 any 等于关闭
 * 类型检查；但 unknown 直接读 .message 又会报错。用本助手收口「取消息」
 * 这一唯一常见用法，让 catch 块保持 unknown 的同时获得可读错误信息。
 */
export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
