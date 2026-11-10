import { Op, UniqueConstraintError, fn, col } from 'sequelize'
import { getTenantContext, runInTenant } from '../../tenant/context.js'
import { ShopOrder, ShopOrderItem, ShopOrderEmail } from '../models/index.js'
import type { OrderMailType } from '../models/ShopOrderEmail.js'
import { ISO_META } from '../../storefront/services/currencyConfig.js'
import { getTransporter } from '../../../utils/mailer.js'

/**
 * 订单邮件通知 outbox（P3-T17 / 门禁 T-12 的「邮件口径」）
 *
 * - 确认 / 发货 / 退款三类邮件，金额**按订单快照币种**渲染，绝不按站点当前币种重算；
 *   只引用 ISO 静态格式元数据（ISO_META），不调用 getActiveCurrency 等站点配置读取；
 * - 入队时把主题与正文连同币种/金额一并落库，发送与重试只读该快照，
 *   因此后台把 USD 改成 CNY 后，历史订单邮件依旧是 USD；
 * - (tenantId,type,orderId,dedupeKey) 唯一：重复 Webhook、重复发货回执不重复发信；
 * - 发送失败按有界指数退避重试（最多 5 次），dead 后可由运营 retryMail 重新入队；
 * - 正文只含订单号 / 明细 / 金额 / 物流号，绝不含卡号、CVV、providerRef、accessToken 等支付凭据；
 * - 外部 SMTP 通过可插拔 provider 注入，默认复用 server/utils/mailer.ts 的 settings 配置。
 */

const MAX_ATTEMPTS = 5
const tid = (): number => getTenantContext()?.tenantId ?? 1

/** 只取 ISO 静态格式元数据，不读 settings：邮件口径不随后台切币种漂移 */
export function formatOrderAmount(amountCents: number, currency: string): string {
  const code = String(currency || 'USD').trim().toUpperCase()
  const meta = ISO_META[code]
  const digits = meta?.decimalDigits ?? 2
  const symbol = meta?.symbol ?? ''
  const value = new Intl.NumberFormat(meta?.locale ?? 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(amountCents) / 10 ** digits)
  return `${symbol}${value} ${code}`
}

export interface MailMessage {
  to: string
  subject: string
  text: string
}
export type MailProvider = (msg: MailMessage) => Promise<void> | void

let mailProvider: MailProvider | null = null
/** 注入邮件发送器（测试 / 外部 ESP）；传 null 恢复默认 SMTP */
export function setMailProvider(fn: MailProvider | null): void {
  mailProvider = fn
}

async function defaultProvider(msg: MailMessage): Promise<void> {
  const transporter = await getTransporter()
  if (!transporter) throw new Error('SMTP 未配置或已禁用')
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@shop.local'
  await transporter.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text })
}

export interface OrderMailSnapshot {
  orderNo: string
  email: string
  currency: string
  amountCents: number
  type: OrderMailType
  lines: { title: string; qty: number; lineTotalCents: number }[]
  trackingNo?: string | null
  carrier?: string | null
  refundAmountCents?: number | null
}

/** 纯文本渲染：所有外部输入做单行化裁剪，避免邮件头/正文注入 */
function clean(value: unknown, max = 120): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max)
}

const SUBJECTS: Record<OrderMailType, string> = {
  confirmed: 'Order confirmed',
  shipped: 'Your order has shipped',
  refunded: 'Refund notification',
}

/** 渲染主题与正文（纯函数，便于测试口径一致性） */
export function renderOrderMail(snapshot: OrderMailSnapshot): { subject: string; text: string } {
  const currency = snapshot.currency.toUpperCase()
  const lines = snapshot.lines.map(
    (l) => `  - ${clean(l.title)} x ${Number(l.qty)}  ${formatOrderAmount(Number(l.lineTotalCents), currency)}`,
  )
  const body: string[] = [
    `${SUBJECTS[snapshot.type]}`,
    '',
    `Order: ${clean(snapshot.orderNo, 64)}`,
    ...lines,
    '',
    `Order total: ${formatOrderAmount(Number(snapshot.amountCents), currency)}`,
  ]
  if (snapshot.type === 'shipped') {
    body.push(`Carrier: ${clean(snapshot.carrier ?? '-', 60)}`, `Tracking No: ${clean(snapshot.trackingNo ?? '-', 60)}`)
  }
  if (snapshot.type === 'refunded' && snapshot.refundAmountCents != null) {
    body.push(`Refund amount: ${formatOrderAmount(Number(snapshot.refundAmountCents), currency)}`)
  }
  body.push('', 'Payment credentials are never included in order emails.', 'Thank you for shopping with us.')
  return { subject: `${SUBJECTS[snapshot.type]} · ${clean(snapshot.orderNo, 64)}`, text: body.join('\n') }
}

export interface OrderMailView {
  id: number
  orderId: number
  orderNo: string
  type: OrderMailType
  dedupeKey: string
  toEmail: string
  subject: string
  bodyText: string
  currency: string
  amountCents: number
  status: string
  attempts: number
  nextAttemptAt: Date | null
  lastError: string | null
  sentAt: Date | null
}

function toView(row: ShopOrderEmail): OrderMailView {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNo: row.orderNo,
    type: row.type,
    dedupeKey: row.dedupeKey,
    toEmail: row.toEmail,
    subject: row.subject,
    bodyText: row.bodyText,
    currency: row.currency,
    amountCents: Number(row.amountCents),
    status: row.status,
    attempts: Number(row.attempts),
    nextAttemptAt: row.nextAttemptAt,
    lastError: row.lastError,
    sentAt: row.sentAt,
  }
}

export interface EnqueueMailParams {
  orderId: number
  type: OrderMailType
  /** 同一订单同类邮件的去重键：发货用运单号、退款用退款单号；确认邮件留空 */
  dedupeKey?: string
  /** 该邮件主金额；省略取订单应付总额（退款邮件传实际退款额） */
  amountCents?: number
  trackingNo?: string | null
  carrier?: string | null
}

/** 入队：读订单快照 → 渲染 → 落 outbox（幂等） */
export async function enqueueOrderMail(params: EnqueueMailParams): Promise<OrderMailView | null> {
  const tId = tid()
  const dedupeKey = (params.dedupeKey ?? '').slice(0, 128)

  const existing = await ShopOrderEmail.findOne({
    where: { tenantId: tId, orderId: params.orderId, type: params.type, dedupeKey },
  })
  if (existing) return toView(existing)

  const order = await ShopOrder.findOne({ where: { id: params.orderId, tenantId: tId } })
  if (!order) throw new Error(`ORDER_NOT_FOUND: 订单 ${params.orderId} 不存在`)
  // 无收件邮箱 / 含换行（头注入）→ 跳过，不阻塞主交易
  if (!order.email || /[\r\n]/.test(order.email)) return null

  const items = await ShopOrderItem.findAll({ where: { orderId: order.id, tenantId: tId }, order: [['id', 'ASC']] })
  const amountCents = params.amountCents ?? Number(order.amountCents)
  const snapshot: OrderMailSnapshot = {
    orderNo: order.orderNo,
    email: order.email,
    currency: order.currency,
    amountCents: Number(order.amountCents),
    type: params.type,
    lines: items.map((i) => ({ title: i.title ?? `SKU ${i.skuId}`, qty: Number(i.qty), lineTotalCents: Number(i.lineTotalCents) })),
    trackingNo: params.trackingNo,
    carrier: params.carrier,
    refundAmountCents: params.type === 'refunded' ? amountCents : null,
  }
  const rendered = renderOrderMail(snapshot)

  try {
    const row = await ShopOrderEmail.create({
      tenantId: tId,
      orderId: order.id,
      orderNo: order.orderNo,
      type: params.type,
      dedupeKey,
      toEmail: order.email,
      subject: rendered.subject,
      bodyText: rendered.text,
      currency: order.currency,
      amountCents,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
      lastError: null,
      sentAt: null,
    } as never)
    return toView(row)
  } catch (err) {
    // 并发下同一事件重放入队：返回首条，不重复发信
    if (err instanceof UniqueConstraintError) {
      const dup = await ShopOrderEmail.findOne({
        where: { tenantId: tId, orderId: params.orderId, type: params.type, dedupeKey },
      })
      if (dup) return toView(dup)
    }
    throw err
  }
}

/** 交易主链路的异常隔离包装：邮件入队失败绝不影响支付 / 发货 / 退款结果 */
export async function tryEnqueue(params: EnqueueMailParams): Promise<void> {
  try {
    await enqueueOrderMail(params)
  } catch (err) {
    console.warn(`[order-mail] ${params.type} 入队失败 orderId=${params.orderId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** 列出某订单的邮件（租户隔离，供后台审计） */
export async function listOrderMails(orderId: number): Promise<OrderMailView[]> {
  const rows = await ShopOrderEmail.findAll({ where: { orderId, tenantId: tid() }, order: [['id', 'ASC']] })
  return rows.map(toView)
}

export interface DrainResult {
  scanned: number
  sent: number
  failed: number
  dead: number
}

/** 处理到期邮件；ignoreSchedule=true 用于运营手动立即重试，orderId 可限定单笔订单 */
export async function drainOutbox(
  opts: { limit?: number; ignoreSchedule?: boolean; now?: Date; orderId?: number } = {},
): Promise<DrainResult> {
  const tId = tid()
  const now = opts.now ?? new Date()
  const where: Record<string, unknown> = { tenantId: tId, status: { [Op.in]: ['pending', 'failed'] } }
  if (opts.orderId) where.orderId = opts.orderId
  if (!opts.ignoreSchedule) where.nextAttemptAt = { [Op.lte]: now }

  const rows = await ShopOrderEmail.findAll({
    where: where as never,
    order: [['id', 'ASC']],
    limit: Math.min(Math.max(opts.limit ?? 20, 1), 200),
  })
  const provider = mailProvider ?? defaultProvider
  const result: DrainResult = { scanned: rows.length, sent: 0, failed: 0, dead: 0 }

  for (const row of rows) {
    const attempts = Number(row.attempts) + 1
    // 发送前先按 attempts 做 CAS 抢占：外部邮件不可回滚，两个 worker 同时扫到同一行时
    // 只能有一个进入 provider，否则会发出两封信而库里只记一次 attempts。
    // 抢占时同步落 attempts / nextAttemptAt，进程在发送中崩溃也会按退避时间重投。
    const [claimed] = await ShopOrderEmail.update(
      {
        attempts,
        nextAttemptAt: new Date(now.getTime() + Math.min(2 ** attempts * 1000, 300_000)),
      },
      {
        where: {
          id: row.id,
          tenantId: tId,
          attempts: Number(row.attempts),
          status: { [Op.in]: ['pending', 'failed'] },
        },
      } as never,
    )
    if (claimed !== 1) continue
    try {
      // 只发出库里已固化的快照，不重新渲染、不读站点币种配置
      await provider({ to: row.toEmail, subject: row.subject, text: row.bodyText })
      await ShopOrderEmail.update(
        { status: 'sent', sentAt: now, lastError: null },
        { where: { id: row.id, tenantId: tId } } as never,
      )
      result.sent++
    } catch (err) {
      const dead = attempts >= MAX_ATTEMPTS
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 255)
      await ShopOrderEmail.update(
        {
          status: dead ? 'dead' : 'failed',
          lastError: message,
          nextAttemptAt: new Date(now.getTime() + Math.min(2 ** attempts * 1000, 300_000)),
        },
        { where: { id: row.id, tenantId: tId } } as never,
      )
      if (dead) result.dead++
      else result.failed++
    }
  }
  return result
}

/** 运营手动重发：仅失败终态可重新入队并清零重试计数 */
export async function retryMail(id: number): Promise<OrderMailView | null> {
  const row = await ShopOrderEmail.findOne({ where: { id, tenantId: tid() } })
  if (!row) return null
  // sent 邮件重投会对同一事件重复发信（外部邮件不可回滚）；pending 已在队列中亦无需重投
  if (row.status !== 'failed' && row.status !== 'dead') return null
  await row.update({ status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: null, sentAt: null } as never)
  return toView(row)
}

/** 枚举「当前有到期待投邮件」的租户：直接取自 outbox，不依赖 tenant 表、天然多租户 */
async function dueOutboxTenantIds(now: Date): Promise<number[]> {
  const rows = (await ShopOrderEmail.findAll({
    attributes: [[fn('DISTINCT', col('tenantId')), 'tenantId']],
    where: { status: { [Op.in]: ['pending', 'failed'] }, nextAttemptAt: { [Op.lte]: now } } as never,
    raw: true,
  })) as unknown as { tenantId: number | string }[]
  return rows.map((r) => Number(r.tenantId)).filter((n) => Number.isInteger(n) && n > 0)
}

/**
 * 订单邮件 outbox 投递扫描器：按 nextAttemptAt 周期投递，驱动有界指数退避重试。
 * 每个租户在独立 TenantContext 内 drain（drainOutbox 自身还有 tenantId WHERE 双保险），
 * 因此进程全局无租户上下文时也不会只处理 tenant 1。
 * 多实例同时扫描同一行时由 drainOutbox 的 attempts CAS 抢占保证只发一封。
 * 返回停止函数；timer.unref() 避免挂住优雅关闭/测试进程退出。
 */
export function startOrderMailScanner(intervalMs = 60 * 1000, tenantIds?: number[]): () => void {
  const timer = setInterval(async () => {
    try {
      // 固定租户列表（单租户部署/测试）优先；否则按 outbox 待投数据动态枚举
      const tenants = tenantIds?.length ? tenantIds : await dueOutboxTenantIds(new Date())
      for (const tenantId of tenants) {
        // 与其它扫描器统一口径：按租户失败隔离，单个租户异常不阻断其余租户
        try {
          const r = await runInTenant({ tenantId }, () => drainOutbox({ limit: 50 }))
          if (r.sent > 0 || r.dead > 0) console.log(`[order-mail] tenant=${tenantId} 投递 ${r.sent} 封 / dead ${r.dead} 封`)
        } catch (err) {
          console.warn(`[order-mail] tenant=${tenantId} 投递失败: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    } catch (err) {
      console.warn(`[order-mail] 扫描失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, Math.max(intervalMs, 10))
  timer.unref?.()
  return () => clearInterval(timer)
}
