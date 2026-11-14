import { Op } from 'sequelize'
import { ShopWishlist, ShopMailOutbox, ShopSpu } from '../../shop/models/index.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { productUrl, resolveUnsubscribeToken, withCallToAction } from './mailFooterService.js'

/**
 * 收藏夹 Wishlist 服务（C 端顾客）
 *
 * - 增/删/查/清空/开关降价提醒/是否已收藏
 * - 降价提醒钩子 notifyPriceDrop：价格变更时对收藏了该商品的顾客入 shop_mail_outbox（幂等 uq）
 * - 站点隔离对齐 catalogService：siteId 为可空（不区分单站点时为 null）
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface WishlistItem {
  productId: number
  notifyOnSale: boolean
  createdAt: Date
}

/** GET 我的收藏 id 列表（分页） */
export async function listWishlist(
  customerId: number,
  opts: { page?: number; pageSize?: number; notifyOnSale?: boolean } = {},
): Promise<{ items: WishlistItem[]; total: number; page: number; pageSize: number }> {
  const tId = tid()
  const page = opts.page && opts.page > 0 ? opts.page : 1
  const pageSize = Math.min(opts.pageSize && opts.pageSize > 0 ? opts.pageSize : 20, 60)
  const where: Record<string, unknown> = { tenantId: tId, customerId }
  if (opts.notifyOnSale !== undefined) where.notifyOnSale = opts.notifyOnSale

  const { rows, count } = await ShopWishlist.findAndCountAll({
    where,
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })

  return {
    items: rows.map((r) => ({
      productId: r.productId,
      notifyOnSale: r.notifyOnSale,
      createdAt: r.createdAt,
    })),
    total: count,
    page,
    pageSize,
  }
}

/** POST 收藏：uq(customer,product) 幂等；已收藏则更新 notifyOnSale */
export async function addWishlist(
  customerId: number,
  productId: number,
  opts: { notifyOnSale?: boolean; siteId?: number | null } = {},
): Promise<{ id: number; created: boolean }> {
  const tId = tid()
  // 商品存在性校验（防脏数据）
  const spu = await ShopSpu.findOne({ where: { id: productId, tenantId: tId } })
  if (!spu) throw new AppError(404, '商品不存在')

  const existing = await ShopWishlist.findOne({
    where: { tenantId: tId, customerId, productId },
  })
  if (existing) {
    if (opts.notifyOnSale !== undefined && existing.notifyOnSale !== opts.notifyOnSale) {
      await existing.update({ notifyOnSale: opts.notifyOnSale })
    }
    return { id: existing.id, created: false }
  }

  const row = await ShopWishlist.create({
    tenantId: tId,
    siteId: opts.siteId ?? null,
    customerId,
    productId,
    notifyOnSale: opts.notifyOnSale ?? true,
  })
  return { id: row.id, created: true }
}

/** DELETE 取消收藏：不存在返回 404 */
export async function removeWishlist(customerId: number, productId: number): Promise<{ productId: number }> {
  const tId = tid()
  const count = await ShopWishlist.destroy({ where: { tenantId: tId, customerId, productId } })
  if (count === 0) throw new AppError(404, '未收藏该商品')
  return { productId }
}

/** PATCH 开关降价提醒 */
export async function setNotifyOnSale(customerId: number, productId: number, notifyOnSale: boolean): Promise<{ productId: number; notifyOnSale: boolean }> {
  const tId = tid()
  const row = await ShopWishlist.findOne({ where: { tenantId: tId, customerId, productId } })
  if (!row) throw new AppError(404, '未收藏该商品')
  await row.update({ notifyOnSale })
  return { productId, notifyOnSale: row.notifyOnSale }
}

/** 是否已收藏（详情页心形图标状态） */
export async function isWishlisted(customerId: number, productId: number): Promise<boolean> {
  const tId = tid()
  const count = await ShopWishlist.count({ where: { tenantId: tId, customerId, productId } })
  return count > 0
}

/** DELETE 清空收藏 */
export async function clearWishlist(customerId: number): Promise<{ deleted: number }> {
  const tId = tid()
  const count = await ShopWishlist.destroy({ where: { tenantId: tId, customerId } })
  return { deleted: count }
}

// ————————————————————————————————————————————————
// 降价提醒钩子
// ————————————————————————————————————————————————

/**
 * 价格变更时通知收藏了该商品的顾客。
 * - 输入：productId（SPU id）、oldPrice/newPrice（同币种，product_prices.amount 原始单位=元）
 * - 取所有收藏了该商品且 notifyOnSale=true 的顾客，入 shop_mail_outbox
 * - 幂等：uq(tenantId, 'price_drop', `{productId}:{oldPrice}:{newPrice}`) 只发一次
 * - SMTP 未配置时留 pending，可后台重试；不阻塞价格写入（调用方 catch 隔离）
 */
export async function notifyPriceDrop(
  productId: number,
  opts: { oldPrice: number; newPrice: number; currency: string; productName: string },
): Promise<{ queued: number }> {
  const tId = tid()
  // 只发降价（新价更低）；涨价不通知
  if (opts.newPrice >= opts.oldPrice) return { queued: 0 }

  const watchers = await ShopWishlist.findAll({
    where: { tenantId: tId, productId, notifyOnSale: true },
    attributes: ['customerId'],
  })
  if (!watchers.length) return { queued: 0 }

  // 顾客邮箱从 customers 表取（不在 wishlist 表）；动态 import 避免潜在循环
  const { ShopCustomer } = await import('../../shop/models/index.js')
  const customerIds = watchers.map((w) => w.customerId)
  const customers = await ShopCustomer.findAll({
    where: { id: { [Op.in]: customerIds }, tenantId: tId, status: 'active' },
    attributes: ['id', 'email'],
  })

  const discountPct = Math.round(((opts.oldPrice - opts.newPrice) / opts.oldPrice) * 100)
  // product_prices.amount 单位=元；币种符号复用 ISO_META（C1 禁止硬编码符号），未知币种回退 ISO 代码
  const { ISO_META } = await import('../services/currencyConfig.js')
  const symbol = ISO_META[opts.currency]?.symbol ?? opts.currency
  const fmtPrice = (amount: number) => `${symbol}${amount.toFixed(2)}`
  const dedupeBase = `${productId}:${opts.oldPrice}:${opts.newPrice}`

  let queued = 0
  for (const c of customers) {
    if (!c.email || /[\r\n]/.test(c.email)) continue
    const dedupeKey = `${dedupeBase}:${c.id}`
    // uq(tenantId, type, dedupeKey) 幂等：同顾客同降价只入队一次
    const existing = await ShopMailOutbox.findOne({
      where: { tenantId: tId, type: 'price_drop', dedupeKey },
    })
    if (existing) continue

    await ShopMailOutbox.create({
      tenantId: tId,
      type: 'price_drop',
      toEmail: c.email,
      customerId: c.id,
      subject: `Price drop: ${opts.productName} -${discountPct}%`,
      // PLAN 4.4：补商品深链与退订入口。详情接口支持纯 id 解析，因此无需额外查 slug。
      bodyText: withCallToAction(
        [
          `Good news! The price of "${opts.productName}" you saved has dropped:`,
          `  Old: ${fmtPrice(opts.oldPrice)}`,
          `  New: ${fmtPrice(opts.newPrice)} (-${discountPct}%)`,
          ``,
          `Grab it before it sells out!`,
        ].join('\n'),
        {
          cta: { label: 'View the item', url: productUrl(productId) },
          unsubscribeToken: await resolveUnsubscribeToken(c.email),
          siteName: 'Aurora Hair Studio',
        },
      ),
      dedupeKey,
      status: 'pending',
    } as never)
    queued++
  }

  return { queued }
}

/** GET outbox 未发送数（后台监控用） */
export async function pendingOutboxCount(): Promise<number> {
  const tId = tid()
  return ShopMailOutbox.count({ where: { tenantId: tId, status: 'pending' } })
}
