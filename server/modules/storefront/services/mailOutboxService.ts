import { getTenantContext, runInTenant } from '../../tenant/context.js'
import { ShopMailOutbox } from '../../shop/models/index.js'
import { getMailProvider } from '../../shop/services/orderMailService.js'

/**
 * 通用营销邮件 outbox 投递扫描器（shop_mail_outbox 表）。
 *
 * 与订单邮件（shop_order_email_outbox，drainOutbox）分开：本表面向低频营销/提醒类邮件
 * （price_drop / restock / back_in_stock / abandoned_cart），字段更简（无 attempts CAS），
 * 用 status CAS 抢占（pending → sent/failed）保证同一封只发一次。
 *
 * 收件人（wishlist/abandoned_cart）已在上游做过打扰规避：未订阅/无 email/blocked 均不入队。
 * 本扫描器只负责把 pending 尽力发出：成功标 sent，失败标 failed 记 error（外部邮件不可回滚，
 * 不做自动重投，避免重复打扰顾客；运营可在 admin 重发）。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface DrainMailOutboxResult {
  scanned: number
  sent: number
  failed: number
}

/** 单租户 drain：发送一批 pending 营销邮件 */
export async function drainMailOutbox(
  opts: { limit?: number } = {},
): Promise<DrainMailOutboxResult> {
  const tId = tid()
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 200)
  const provider = getMailProvider()

  const rows = await ShopMailOutbox.findAll({
    where: { tenantId: tId, status: 'pending' },
    order: [['id', 'ASC']],
    limit,
  })
  const result: DrainMailOutboxResult = { scanned: rows.length, sent: 0, failed: 0 }

  for (const row of rows) {
    // CAS 抢占：先标 sent（唯一 status 抢占），发送失败再改 failed
    // 无 sending 中间态（ENUM 只有 pending/sent/failed），用 sent 作为抢占锁
    const [claimed] = await ShopMailOutbox.update(
      { status: 'sent', sentAt: new Date(), error: null },
      { where: { id: row.id, tenantId: tId, status: 'pending' } } as never,
    )
    if (claimed !== 1) continue
    try {
      await provider({ to: row.toEmail, subject: row.subject, text: row.bodyText })
      result.sent++
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500)
      await ShopMailOutbox.update(
        { status: 'failed', error: message, sentAt: null },
        { where: { id: row.id, tenantId: tId, status: 'sent' } } as never,
      )
      result.failed++
    }
  }

  return result
}

/** 全租户扫描：按 outbox 内待投邮件的 tenantId 逐租户 drain */
export async function scanAllTenantsMailOutbox(limit = 50): Promise<DrainMailOutboxResult> {
  const rows = await ShopMailOutbox.findAll({
    where: { status: 'pending' },
    attributes: [[ 'tenantId', 'tenantId' ]],
    group: ['tenantId'],
    raw: true,
  })
  const total: DrainMailOutboxResult = { scanned: 0, sent: 0, failed: 0 }
  for (const r of rows) {
    const tenantId = Number((r as { tenantId: number }).tenantId)
    const res = await runInTenant({ tenantId }, () => drainMailOutbox({ limit }))
    total.scanned += res.scanned
    total.sent += res.sent
    total.failed += res.failed
  }
  return total
}

/** 启动营销邮件投递扫描器（默认每 60 秒；进程级，无租户上下文由 scanAllTenants 处理） */
export function startMailOutboxScanner(intervalMs = 60 * 1000): () => void {
  const timer = setInterval(async () => {
    try {
      const r = await scanAllTenantsMailOutbox()
      if (r.sent > 0 || r.failed > 0) {
        console.log(`[mail-outbox] scanned=${r.scanned} sent=${r.sent} failed=${r.failed}`)
      }
    } catch (err) {
      console.error('[mail-outbox] scan failed:', (err as Error).message)
    }
  }, intervalMs)
  if (typeof timer === 'object' && 'unref' in timer) (timer as { unref: () => void }).unref?.()
  return () => clearInterval(timer)
}
