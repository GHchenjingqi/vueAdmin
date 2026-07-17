/**
 * 错误处理工具（向后兼容导出）
 *
 * 推荐使用 src/utils/errors.ts 中的 AppError 和 createAppError
 */
export { AppError, createAppError, getErrorMessage, isUserCancel, isNetworkError, isAuthError, isValidationError } from './errors'
export type { ErrorCode } from './errors'
