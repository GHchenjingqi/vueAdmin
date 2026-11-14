import { randomBytes } from 'node:crypto'
import { getTenantContext } from '../../tenant/context.js'
import { ShopNewsletter } from '../../shop/models/index.js'

/**
 * 营销邮件公共部件（PLAN 4.4）
 *
 * 缺口：弃购召回、降价提醒的邮件正文只有商品名与价格，**没有商品链接、没有退订入口**。
 * 结果是转化链路断在邮件里，且有 CAN-SPAM / GDPR 合规风险（商业邮件必须提供退订方式）。
 *
 * 本模块只提供三个纯函数 + 一个 token 获取函数，不改变既有入队/投递逻辑：
 * - `buildUnsubscribeUrl`：基于 newsletter 的不可枚举 token 生成退订链接（复用已有 GET /newsletter/unsubscribe）
 * - `withCallToAction`：在正文尾部追加 CTA 与退订行
 * - `resolveUnsubscribeToken`：有订阅记录用其 token；没有则建一条 pending 订阅拿 token
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

/** 站点根地址：优先 NUXT_PUBLIC_SITE_URL（与 sitemap/canonical 同源），避免硬编码域名 */
export function siteBaseUrl(): string {
  const raw = process.env.NUXT_PUBLIC_SITE_URL || process.env.SITE_URL || ''
  return raw.replace(/\/+$/, '')
}

/** 商品深链（相对路径，由 siteBaseUrl 拼绝对地址；无 base 时退回相对路径） */
export function productUrl(slugOrId: string | number): string {
  const base = siteBaseUrl()
  const path = `/products/${encodeURIComponent(String(slugOrId))}`
  return base ? `${base}${path}` : path
}

/** 购物车恢复链接：引导回站内购物车页 */
export function cartUrl(): string {
  const base = siteBaseUrl()
  return base ? `${base}/cart` : '/cart'
}

/** 退订链接（token 为空时返回 null，调用方据此决定是否省略该行） */
export function buildUnsubscribeUrl(token: string | null | undefined): string | null {
  if (!token) return null
  const base = siteBaseUrl()
  const path = `/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`
  return base ? `${base}${path}` : path
}

export interface MailFooterOptions {
  /** 主 CTA 文案与链接；缺省则只加退订行 */
  cta?: { label: string; url: string }
  unsubscribeToken?: string | null
  /** 站点名（页脚署名） */
  siteName?: string
}

/**
 * 在纯文本正文尾部追加 CTA 与退订行。
 *
 * 纯文本邮件（当前投递器只发 text）用换行分隔，不做 HTML，避免被判定为富文本营销，
 * 也避免在各家客户端渲染差异。退订缺失时不伪造占位符。
 */
export function withCallToAction(bodyText: string, opts: MailFooterOptions): string {
  const lines = [bodyText.trimEnd(), '']
  if (opts.cta) {
    lines.push(`${opts.cta.label}: ${opts.cta.url}`, '')
  }
  const unsub = buildUnsubscribeUrl(opts.unsubscribeToken)
  if (unsub) {
    lines.push('—', `Unsubscribe: ${unsub}`)
  }
  if (opts.siteName) lines.push(opts.siteName)
  return lines.join('\n')
}

/**
 * 取该邮箱的退订 token。
 *
 * 营销邮件的收件人不一定订阅过 newsletter（例如只在收藏时留过邮箱）。
 * 这里为「未订阅但需要发营销邮件」的地址补建一条 subscribed 记录并返回 token，
 * 使退订链接始终可用 —— 合规要求退订入口不能因为「没订阅过」而缺失。
 */
export async function resolveUnsubscribeToken(email: string, locale?: string): Promise<string | null> {
  const normalized = String(email ?? '').trim().toLowerCase()
  if (!normalized || !normalized.includes('@')) return null
  const tId = tid()
  const existed = await ShopNewsletter.findOne({ where: { tenantId: tId, email: normalized } })
  if (existed?.token) return existed.token
  const token = randomBytes(24).toString('hex')
  try {
    await ShopNewsletter.create({
      tenantId: tId,
      email: normalized,
      status: 'subscribed',
      source: 'marketing_footer',
      locale: locale ?? null,
      token,
      subscribedAt: new Date(),
    } as never)
    return token
  } catch {
    // 并发下可能撞唯一键：回读一次，仍拿不到就返回 null（调用方省略退订行）
    const retry = await ShopNewsletter.findOne({ where: { tenantId: tId, email: normalized } })
    return retry?.token ?? null
  }
}
