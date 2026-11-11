import { Op } from 'sequelize'
import { getTenantContext } from '../../tenant/context.js'
import { ShopCart, ShopCartItem, ShopCustomer, ShopMailOutbox, ShopNewsletter, ShopOrder } from '../../shop/models/index.js'
import { ISO_META } from './currencyConfig.js'

/**
 * 弃购召回邮件（abandoned cart recovery）
 *
 * 两档自动提醒：加购未付款 1h / 24h 各一次。面向登录顾客（cart.customerId → customers.email），
 * 游客购物车无 email 不投递。纯文本英文正文，落 shop_mail_outbox 由通用投递扫描器发送。
 *
 * 幂等：uq(tenantId, type, dedupeKey)，dedupeKey = `abandoned_cart:{tier}:{cartId}:{cartVersion}`
 * —— 同一购物车同一档只发一次；顾客再次加购（version 变化）可再次触发。
 *
 * 打扰规避：
 * - 已支付订单时间晚于购物车最后更新 → 视为已下单，跳过；
 * - 顾客已退订营销邮件（newsletters.status='unsubscribed'）→ 跳过；
 * - 购物车空 / 顾客无 email / blocked 状态 → 跳过。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

/** 两档：1 小时、24 小时（毫秒） */
export const TIER_1H_MS = 60 * 60 * 1000
export const TIER_24H_MS = 24 * 60 * 60 * 1000

export interface AbandonedCandidate {
  cartId: number
  token: string
  customerId: number
  email: string
  currency: string
  locale: string | null
  /** 距最后加购毫秒数 */
  idleMs: number
  /** 命中的档位 */
  tier: '1h' | '24h'
  items: { title: string; qty: number; unitAmountCents: number }[]
  subtotalCents: number
  cartVersion: number
}

function fmtPrice(amountCents: number, currency: string): string {
  const code = String(currency || 'USD').toUpperCase()
  const meta = ISO_META[code]
  const digits = meta?.decimalDigits ?? 2
  const symbol = meta?.symbol ?? ''
  const value = new Intl.NumberFormat(meta?.locale ?? 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amountCents / 10 ** digits)
  return `${symbol}${value}`
}

function renderEmail(c: AbandonedCandidate, siteName = 'Aurora Hair Studio'): { subject: string; bodyText: string } {
  const lines = c.items
    .slice(0, 5)
    .map((it) => `  • ${it.title} × ${it.qty} — ${fmtPrice(it.unitAmountCents * it.qty, c.currency)}`)
    .join('\n')
  if (c.tier === '1h') {
    return {
      subject: `You left something in your cart`,
      bodyText: [
        `Hi,`,
        ``,
        `You added the following to your cart but haven't checked out yet:`,
        lines,
        ``,
        `Subtotal: ${fmtPrice(c.subtotalCents, c.currency)}`,
        ``,
        `Your cart is saved and ready whenever you are.`,
        ``,
        `— ${siteName}`,
      ].join('\n'),
    }
  }
  return {
    subject: `Still thinking it over? Your cart is waiting`,
    bodyText: [
      `Hi,`,
      ``,
      `A quick reminder — the items in your cart are still reserved for you:`,
      lines,
      ``,
      `Subtotal: ${fmtPrice(c.subtotalCents, c.currency)}`,
      ``,
      `Items may sell out, so don't wait too long.`,
      ``,
      `— ${siteName}`,
    ].join('\n'),
  }
}

/** 顾客是否已退订营销邮件（无订阅记录视为可发；仅 unsubscribed 阻断） */
async function isUnsubscribed(email: string): Promise<boolean> {
  const row = await ShopNewsletter.findOne({ where: { tenantId: tid(), email } })
  return row?.status === 'unsubscribed'
}

/**
 * 扫描并召回一批弃购购物车。
 * @param opts.now 当前时间（测试注入）；默认 Date.now()
 * @param opts.limit 单轮最多处理购物车数（默认 200）
 * @param opts.tiers 启用档位（默认两档全开）
 */
export async function scanAndNotify(
  opts: { now?: Date; limit?: number; tiers?: ('1h' | '24h')[] } = {},
): Promise<{ scanned: number; queued: number; skipped: { paid: number; unsubscribed: number; noEmail: number } }> {
  const tId = tid()
  const now = opts.now ?? new Date()
  const limit = Math.min(Math.max(1, opts.limit ?? 200), 1000)
  const tiers = opts.tiers ?? ['1h', '24h']

  const result = { scanned: 0, queued: 0, skipped: { paid: 0, unsubscribed: 0, noEmail: 0 } }

  // 取有归属顾客、最近有更新、且更新时间早于最早档位的购物车
  const earliest = tiers.includes('1h') ? TIER_1H_MS : TIER_24H_MS
  const cutoff = new Date(now.getTime() - earliest)
  const carts = await ShopCart.findAll({
    where: {
      tenantId: tId,
      customerId: { [Op.ne]: null },
      updatedAt: { [Op.lt]: cutoff },
    },
    order: [['updatedAt', 'ASC']],
    limit,
  })

  for (const cart of carts) {
    result.scanned++
    const idleMs = now.getTime() - new Date(cart.updatedAt).getTime()

    // 命中哪些档位（同一轮可能同时过 1h 和 24h，但去重键保证各只发一次）
    const hitTiers: ('1h' | '24h')[] = []
    if (tiers.includes('24h') && idleMs >= TIER_24H_MS) hitTiers.push('24h')
    else if (tiers.includes('1h') && idleMs >= TIER_1H_MS) hitTiers.push('1h')
    if (!hitTiers.length) continue

    const customerId = cart.customerId!
    const customer = await ShopCustomer.findOne({
      where: { id: customerId, tenantId: tId },
      attributes: ['id', 'email', 'status'],
    })
    if (!customer?.email || customer.status === 'blocked') {
      result.skipped.noEmail++
      continue
    }

    // 明细非空
    const items = await ShopCartItem.findAll({ where: { tenantId: tId, cartId: cart.id } })
    if (!items.length) continue

    // 已下单判定：该顾客已支付订单时间晚于购物车最后更新 → 视为已结账，跳过
    const paidOrder = await ShopOrder.findOne({
      where: {
        tenantId: tId,
        email: customer.email,
        status: { [Op.in]: ['paid', 'fulfilled', 'shipped', 'done'] },
        createdAt: { [Op.gt]: new Date(cart.updatedAt) },
      },
      attributes: ['id'],
    })
    if (paidOrder) {
      result.skipped.paid++
      continue
    }

    if (await isUnsubscribed(customer.email)) {
      result.skipped.unsubscribed++
      continue
    }

    const cand: AbandonedCandidate = {
      cartId: cart.id,
      token: cart.token,
      customerId,
      email: customer.email,
      currency: cart.currency,
      locale: cart.locale,
      idleMs,
      tier: hitTiers[0],
      items: items.map((it) => ({
        title: it.titleSnapshot ?? `Item #${it.skuId}`,
        qty: it.qty,
        unitAmountCents: Number(it.unitAmountCents),
      })),
      subtotalCents: items.reduce((sum, it) => sum + Number(it.unitAmountCents) * it.qty, 0),
      cartVersion: cart.version,
    }

    const { subject, bodyText } = renderEmail(cand)
    const dedupeKey = `abandoned_cart:${cand.tier}:${cart.id}:${cart.version}`
    const existing = await ShopMailOutbox.findOne({
      where: { tenantId: tId, type: 'abandoned_cart', dedupeKey },
    })
    if (existing) continue

    await ShopMailOutbox.create({
      tenantId: tId,
      type: 'abandoned_cart',
      toEmail: customer.email,
      customerId,
      subject,
      bodyText,
      dedupeKey,
      status: 'pending',
    } as never)
    result.queued++
  }

  return result
}

/** 弃购召回扫描器（默认每小时一次；进程级，无租户上下文由 scanAndNotify 逐租户处理） */
export function startAbandonedCartScanner(intervalMs = 60 * 60 * 1000): () => void {
  const timer = setInterval(async () => {
    try {
      const r = await scanAndNotify({ limit: 500 })
      if (r.queued > 0) {
        // 静默：仅在有入队时打印，避免日志噪声
        console.log(`[abandoned-cart] scanned=${r.scanned} queued=${r.queued} skipped=${JSON.stringify(r.skipped)}`)
      }
    } catch (err) {
      console.error('[abandoned-cart] scan failed:', (err as Error).message)
    }
  }, intervalMs)
  // 不阻塞进程退出
  if (typeof timer === 'object' && 'unref' in timer) (timer as { unref: () => void }).unref?.()
  return () => clearInterval(timer)
}
