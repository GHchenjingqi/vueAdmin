/**
 * A/B 实验框架（P5-T08）
 *
 * 设计约束（验收标准）：
 * 1. 实验不影响报价与库存正确性 —— 本框架纯只读、无持久层写入，仅返回分桶结果；
 *    业务侧须自行保证 variant 只作用于展示层，不得进入 Quote/库存计算。
 * 2. 可一键关闭 —— 依赖 X-T04 Feature Flag `ab_test`（默认关闭）。
 *    关闭态直接降级为 control，且**不计算分桶、不触发曝光 hook**（零副作用）。
 * 3. 分桶确定性 —— FNV-1a 32 位哈希（salt:key:subjectId）取 0..99，按权重落入 variant；
 *    同一 subject 恒定，无需存储，天然可重放与对账。
 *
 * 曝光记录：由调用方通过 hooks.exposure 注入（默认空实现）。关闭态不调用，
 * 便于以单测实证「零副作用」；后续接 analytics/审计时只需换 hook，不动分桶逻辑。
 */
import { isFeatureEnabled } from '../featureflags/featureFlags.js'

const FLAG_KEY = 'ab_test'
/** 分桶盐，变更会使全部分桶重排（等同重置实验） */
const BUCKET_SALT = 'exp-v1'

export interface ExperimentVariant {
  id: string
  /** 权重（百分数），同一实验所有 variant 权重和必须为 100 */
  weight: number
}

export interface ExperimentDef {
  key: string
  description: string
  variants: ExperimentVariant[]
}

/** 实验注册表（示例定义；业务实验由运营配置后追加，均为展示层实验） */
export const EXPERIMENTS: ExperimentDef[] = [
  {
    key: 'checkout_cta',
    description: '结算按钮文案实验（示例，仅展示层）',
    variants: [{ id: 'control', weight: 50 }, { id: 'variant_a', weight: 50 }],
  },
  {
    key: 'product_recommendation',
    description: '商品推荐位排序实验（示例，仅展示层）',
    variants: [{ id: 'control', weight: 34 }, { id: 'variant_b', weight: 33 }, { id: 'variant_c', weight: 33 }],
  },
]

export type AssignmentReason = 'feature_disabled' | 'unknown_experiment' | 'missing_subject' | 'assigned'

export interface Assignment {
  key: string
  enabled: boolean
  variant: string
  reason: AssignmentReason
}

export interface ExperimentHooks {
  /** 曝光回调（仅开启态且成功分桶时触发一次） */
  exposure?: (e: { key: string; subjectId: string; variant: string }) => void
}

/** 校验实验定义：权重必须为正整数且合计 100 */
export function assertValidDef(def: ExperimentDef): void {
  if (!def.key) throw new Error('实验 key 不能为空')
  if (!def.variants.length) throw new Error(`实验 ${def.key} 无 variant`)
  const total = def.variants.reduce((sum, v) => {
    if (!Number.isInteger(v.weight) || v.weight <= 0) throw new Error(`实验 ${def.key} 的权重须为正整数`)
    return sum + v.weight
  }, 0)
  if (total !== 100) throw new Error(`实验 ${def.key} 权重合计须为 100，实际 ${total}`)
  if (!def.variants.some((v) => v.id === 'control')) throw new Error(`实验 ${def.key} 必须包含 control 变体`)
}

EXPERIMENTS.forEach(assertValidDef)

/** FNV-1a 32 位哈希，返回 0..99 桶号 */
export function bucketOf(key: string, subjectId: string): number {
  const input = `${BUCKET_SALT}:${key}:${subjectId}`
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % 100
}

/** 确定性分桶：按权重累积区间选择 variant */
export function assignVariant(def: ExperimentDef, subjectId: string): string {
  const bucket = bucketOf(def.key, subjectId)
  let acc = 0
  for (const v of def.variants) {
    acc += v.weight
    if (bucket < acc) return v.id
  }
  return 'control'
}

/** 列出实验定义（admin 可查询，用于灰度管理与对账） */
export function listExperiments(): Array<ExperimentDef & { flag: string }> {
  return EXPERIMENTS.map((d) => ({ ...d, flag: FLAG_KEY }))
}

/**
 * 解析分派结果：先查 flag，关闭态直接 control（不计算分桶、不触发曝光 hook）。
 * 未知实验 / 空 subjectId 同样 fail-closed 降级 control。
 */
export async function resolveAssignment(
  key: string,
  subjectId: string | undefined,
  hooks: ExperimentHooks = {},
): Promise<Assignment> {
  const on = await isFeatureEnabled(FLAG_KEY)
  if (!on) return { key, enabled: false, variant: 'control', reason: 'feature_disabled' }

  const def = EXPERIMENTS.find((d) => d.key === key)
  if (!def) return { key, enabled: true, variant: 'control', reason: 'unknown_experiment' }
  if (!subjectId) return { key, enabled: true, variant: 'control', reason: 'missing_subject' }

  const variant = assignVariant(def, subjectId)
  hooks.exposure?.({ key, subjectId, variant })
  return { key, enabled: true, variant, reason: 'assigned' }
}
