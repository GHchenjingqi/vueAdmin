import { getTenantContext } from './context.js'

/**
 * 列表/详情接口的租户作用域助手（M1）
 *
 * 设计要点：
 * - 与全局 Sequelize scope 钩子（sequelizeTenantScope.ts）互补：钩子按模型属性
 *   自动注入，本助手用于**需要显式控制注入时机**的场景——尤其是列表缓存：
 *   缓存键必须在注入租户条件之前生成，否则不同租户的同一查询会共用缓存键，
 *   造成跨租户数据经缓存泄漏。
 * - 平台超管（isPlatformAdmin/bypass）不约束，可见全部租户数据。
 * - 旧 token 缺 tenantId 时兜底 -1（不匹配任何行），防止静默全量泄漏。
 * - 无租户上下文（定时任务、脚本、冒烟）不约束，由调用方保证自身边界。
 */

/** 当前请求的租户约束；null 表示不约束 */
export function currentTenantConstraint(): { tenantId: number } | null {
  const ctx = getTenantContext()
  if (!ctx || ctx.bypass) return null
  return { tenantId: ctx.tenantId ?? -1 }
}

/**
 * 将租户约束合并进既有 where（原地修改并返回）。
 * 必须在缓存键生成之前调用，确保键含租户维度。
 */
export function applyCurrentTenantScope<T extends Record<string, any>>(where: T): T {
  const constraint = currentTenantConstraint()
  if (constraint) Object.assign(where, constraint)
  return where
}
