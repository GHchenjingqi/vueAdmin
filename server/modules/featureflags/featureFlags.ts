/**
 * Feature Flag 机制（X-T04）
 *
 * 定位：新功能可灰度、可回滚。所有「关键新功能」默认关闭（defaultEnabled=false），
 * 仅当明确开启后才对外生效；关闭态下无任何副作用（路由守卫直接 403，业务分支不执行）。
 *
 * 持久化：Setting('feature.flags') 存 JSON 覆盖表 { key: true|false }，
 * 与定义合并后得到最终启用态；未覆盖的 key 取定义 defaultEnabled。
 * 变更经 ShopConfigChange 之外的专用审计（见 setFlag），记录操作人。
 *
 * 读取：进程内缓存 + 首次懒加载，setFlag 时失效；公开查询走 fail-closed（未定义 key → false）。
 */

import type { NextFunction, Request, Response } from 'express'
import Setting from '../../models/Setting.js'
import { AppError } from '../../middleware/errorHandler.js'

export interface FlagDef {
  key: string
  description: string
  defaultEnabled: boolean
}

/** 关键新功能注册表：默认关闭，仅灰度期/发布后由 admin 开启 */
export const FLAG_DEFS: FlagDef[] = [
  { key: 'referral', description: 'Referral / Affiliate 归因与结算（P5-T07）', defaultEnabled: false },
  { key: 'bundle', description: 'Bundle / 搭配购 / 推荐位（P5-T05）', defaultEnabled: false },
  { key: 'ab_test', description: 'A/B 测试与个性化（P5-T08）', defaultEnabled: false },
  { key: 'multi_warehouse', description: '多仓与精细配送策略（P5-T04）', defaultEnabled: false },
  { key: 'blog', description: '博客 CMS 与内容 SEO（P5-T06）', defaultEnabled: false },
]

const FLAG_SETTING_KEY = 'feature.flags'

let overrides: Record<string, boolean> | null = null

async function loadOverrides(): Promise<Record<string, boolean>> {
  if (overrides) return overrides
  const row = await Setting.findOne({ where: { optionKey: FLAG_SETTING_KEY } })
  if (!row?.optionValue) {
    overrides = {}
    return overrides
  }
  try {
    overrides = JSON.parse(row.optionValue) as Record<string, boolean>
  } catch {
    overrides = {}
  }
  return overrides
}

function defOf(key: string): FlagDef | undefined {
  return FLAG_DEFS.find((d) => d.key === key)
}

/** 查询某功能是否启用（未定义 key → false，fail-closed） */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const def = defOf(key)
  if (!def) return false
  const ov = await loadOverrides()
  return ov[key] ?? def.defaultEnabled
}

/** 查询所有 flag 及启用态 */
export async function listFlags(): Promise<Array<FlagDef & { enabled: boolean }>> {
  const ov = await loadOverrides()
  return FLAG_DEFS.map((d) => ({ ...d, enabled: ov[d.key] ?? d.defaultEnabled }))
}

/** 设置 flag（admin）。写入覆盖表并失效缓存，记录审计行。 */
export async function setFlag(
  key: string,
  enabled: boolean,
  operator: { id: number | null; name: string | null },
): Promise<{ key: string; enabled: boolean }> {
  const def = defOf(key)
  if (!def) throw new AppError(404, 'FLAG_NOT_FOUND')
  const ov = await loadOverrides()
  const oldValue = ov[key] ?? def.defaultEnabled
  ov[key] = enabled
  await Setting.upsert({ optionKey: FLAG_SETTING_KEY, optionValue: JSON.stringify(ov), autoload: 1 } as never)
  // 记录变更（复用商城配置审计表，键前缀 feature.flags）
  const { default: ShopConfigChange } = await import('../shop/models/ShopConfigChange.js')
  await ShopConfigChange.create({
    tenantId: 1,
    key: `feature.flags.${key}`,
    oldValue,
    newValue: enabled,
    operatorId: operator.id,
    operatorName: operator.name,
    appliedAt: new Date(),
    status: 'applied',
  } as never)
  return { key, enabled }
}

/** 测试/启动时重置缓存 */
export function resetFlagsCache(): void {
  overrides = null
}

/**
 * 路由守卫：功能关闭时 403 FEATURE_DISABLED，且不进入业务逻辑（无副作用）。
 */
export function requireFeature(key: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const on = await isFeatureEnabled(key)
      if (!on) {
        next(new AppError(403, `FEATURE_DISABLED: ${key}`))
        return
      }
      next()
    } catch (err) {
      next(err)
    }
  }
}
