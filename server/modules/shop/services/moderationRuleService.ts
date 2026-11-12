/**
 * 审核风险规则（降本 P1：审核规则化）
 *
 * 纯函数、零 DB 依赖，便于单测与规则回放。评分越高风险越大，低于阈值才允许自动批准。
 * 边界：只有「商品评价」展示态可被自动批准；RMA 批准与退款涉及资金，一律只输出
 * 风险分级供人工优先处理，不产生任何状态变更。
 */

export interface ModerationConfig {
  /** 风险分低于该值才自动批准（1..100，越小越保守） */
  scoreThreshold: number
  /** 单租户单轮自动批准上限，避免一次放过过多内容 */
  maxApprovesPerTenant: number
  /** RMA 高风险金额阈值（分） */
  rmaHighRiskCents: number
}

export const DEFAULT_MODERATION_CONFIG: ModerationConfig = {
  scoreThreshold: 30,
  maxApprovesPerTenant: 50,
  rmaHighRiskCents: 50000,
}

function intOf(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : fallback
}

/** 读取环境变量配置；非法值一律回退默认，避免误配把高风险内容批量放行 */
export function loadModerationConfig(env: NodeJS.ProcessEnv = process.env): ModerationConfig {
  return {
    scoreThreshold: intOf(env.MODERATION_SCORE_THRESHOLD, DEFAULT_MODERATION_CONFIG.scoreThreshold, 1, 100),
    maxApprovesPerTenant: intOf(env.MODERATION_MAX_APPROVES, DEFAULT_MODERATION_CONFIG.maxApprovesPerTenant, 1, 500),
    rmaHighRiskCents: intOf(env.MODERATION_RMA_HIGH_RISK_CENTS, DEFAULT_MODERATION_CONFIG.rmaHighRiskCents, 0, 100000000),
  }
}

const CONTACT_PATTERNS: RegExp[] = [
  /https?:\/\//i,
  /www\./i,
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/,
  /\b1[3-9]\d{9}\b/,
  /\d{6,}/,
  /(微信|wechat|加微|私聊|vx|v信|whatsapp|telegram|qq群|代购|返现|刷单)/i,
]

const DISPUTE_WORDS = ['假货', '骗子', '诈骗', '投诉', '举报', '律师', '曝光', '维权', '315', '工商局']

export interface ReviewRiskInput {
  rating: number
  content: string | null
  title?: string | null
  images?: string[] | null
  verified: boolean
  isAnonymous: boolean
}

export interface RiskAssessment {
  score: number
  reasons: string[]
  decision: 'auto_approve' | 'manual'
  /** 命中硬阻断（身份/差评/引流/争议/空内容），不受阈值配置影响，一律转人工 */
  hardBlocked: boolean
}

/**
 * 评价风险评分。双层判定：
 * - 硬阻断：未验证购买、1~2 星或无效评分、引流外链、争议词、内容为空或过短，
 *   命中即转人工，即使阈值被误配到 100 也不会放行（fail-closed）。
 * - 软评分：3 星、含图、内容过长、匿名等累加风险分，分数 >= 阈值时转人工。
 * 全部命中项留下可解释原因写入审计日志，便于回放。
 */
export function assessReviewRisk(input: ReviewRiskInput, config: ModerationConfig = loadModerationConfig()): RiskAssessment {
  const reasons: string[] = []
  let score = 0
  let hardBlocked = false
  const text = `${input.title ?? ''} ${input.content ?? ''}`.trim()
  const rating = Number(input.rating) || 0

  if (!input.verified) {
    score += 40
    hardBlocked = true
    reasons.push('未通过已购验证')
  }
  if (rating <= 2) {
    score += 40
    hardBlocked = true
    reasons.push(`低评分或无效评分 ${rating} 星`)
  } else if (rating === 3) {
    score += 10
    reasons.push('中评分 3 星')
  }
  if (CONTACT_PATTERNS.some((p) => p.test(text))) {
    score += 40
    hardBlocked = true
    reasons.push('含外链/联系方式/引流词')
  }
  if (DISPUTE_WORDS.some((w) => text.includes(w))) {
    score += 40
    hardBlocked = true
    reasons.push('含争议或投诉词')
  }
  if ((input.images?.length ?? 0) > 0) {
    score += 15
    reasons.push('含图片需人工查看')
  }
  if (text.length < 5) {
    score += 30
    hardBlocked = true
    reasons.push('内容为空或过短')
  } else if (text.length > 500) {
    score += 30
    reasons.push('内容过长')
  }
  if (input.isAnonymous) {
    score += 5
    reasons.push('匿名评价')
  }

  return {
    score,
    reasons,
    hardBlocked,
    decision: hardBlocked || score >= config.scoreThreshold ? 'manual' : 'auto_approve',
  }
}

export interface RmaRiskInput {
  refundAmountCents: number
  reason: string | null
  /** 同一订单历史售后次数 */
  previousRmaCount: number
}

export interface RmaRiskAssessment {
  highRisk: boolean
  reasons: string[]
}

/** RMA 只做风险分级，不返回任何「可自动批准」结论 */
export function assessRmaRisk(input: RmaRiskInput, config: ModerationConfig = loadModerationConfig()): RmaRiskAssessment {
  const reasons: string[] = []
  let highRisk = false
  const amount = Number(input.refundAmountCents) || 0

  if (amount > 0 && amount >= config.rmaHighRiskCents) {
    highRisk = true
    reasons.push(`应退金额 ${amount} 分达到高风险阈值`)
  }
  if ((Number(input.previousRmaCount) || 0) >= 2) {
    highRisk = true
    reasons.push('同订单存在多次售后')
  }
  const reason = input.reason ?? ''
  if (DISPUTE_WORDS.some((w) => reason.includes(w))) {
    highRisk = true
    reasons.push('售后原因含争议词')
  }
  return { highRisk, reasons }
}
