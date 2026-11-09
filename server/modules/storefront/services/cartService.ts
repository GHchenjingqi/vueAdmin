import crypto from 'crypto'
import sequelize from '../../../config/database.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import {
  ShopCart,
  ShopCartItem,
  ShopSku,
  ShopSpu,
  ShopProductPrice,
} from '../../shop/models/index.js'
import * as inventoryService from '../../shop/services/inventoryService.js'
import type { StorefrontSite } from '../middleware/siteContext.js'

/** 单购物车行数量上限（防止合并或加购失控，与下单侧口径一致） */
export const CART_LINE_MAX = 99

/** 有界重试：应对 MySQL 并发写购物车/明细时的偶发死锁（与 shop 各服务同口径） */
async function withDeadlockRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      // MySQL 死锁错误码 1213 / ER_LOCK_DEADLOCK
      if (/1213|ER_LOCK_DEADLOCK|Deadlock/i.test(msg) && i < tries - 1) continue
      throw err
    }
  }
  throw lastErr
}

/**
 * 购物车服务（阶段 5 步骤 4 / P3-T01）
 *
 * 与 shop 模块共用同一套模型，不复制数据、不建第二套后端。
 * 购物车归属：登录顾客 → customerId；游客 → 不可枚举的随机 token（存 httpOnly cookie / X-Cart-Token）。
 * 行内金额 / 标题 / 规格为加购时快照，仅展示用；最终报价由 quoteService 服务端重算。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

/** 生成不可枚举的游客购物车令牌（48 位 hex） */
export function genCartToken(): string {
  return crypto.randomBytes(24).toString('hex')
}

/** 多语言文本取当前站点语言，回退 en-US / zh-CN / 首个可用值 */
function localize(value: Record<string, string> | null | undefined, lang: string): string {
  if (!value) return ''
  return value[lang] ?? value['en-US'] ?? value['zh-CN'] ?? Object.values(value)[0] ?? ''
}

async function findCart(token: string): Promise<ShopCart | null> {
  return ShopCart.findOne({ where: { token, tenantId: tid() } })
}

/** 取购物车（按 token），不存在则按站点币种新建。customerId 仅在登录态传入。 */
export async function getOrCreateCart(site: StorefrontSite, token?: string, customerId?: number, locale?: string): Promise<ShopCart> {
  let cart: ShopCart | null = null
  if (token) cart = await findCart(token)
  if (!cart) {
    cart = await ShopCart.create({
      tenantId: tid(),
      token: genCartToken(),
      customerId: customerId ?? null,
      currency: site.defaultCurrency,
      locale: locale ?? null,
    } as never)
  } else if (locale) {
    // 语言快照随访问刷新（与币种互不推导，不参与报价）
    await cart.update({ locale } as never)
  }
  return cart
}

/** 加购 / 更新数量（同一 SKU 行内唯一，重复加购累加数量） */
export async function addItem(
  site: StorefrontSite,
  token: string | undefined,
  input: { skuId: number; qty: number },
  customerId?: number,
  locale?: string,
): Promise<ShopCart> {
  const cart = await getOrCreateCart(site, token, customerId, locale)
  const tId = tid()

  const sku = await ShopSku.findOne({ where: { id: input.skuId, tenantId: tId } })
  if (!sku) throw new AppError(404, `SKU ${input.skuId} 不存在`)
  const spu = await ShopSpu.findOne({ where: { id: sku.spuId, tenantId: tId } })

  // 加购时快照：当前购物车币种下的价格（缺失则记 0，下单时由 quote 拦截）
  const priceRow = await ShopProductPrice.findOne({
    where: { skuId: sku.id, currency: cart.currency, tenantId: tId },
  })
  const unitAmountCents = priceRow ? Math.round(Number(priceRow.amount) * 100) : 0

  const existing = await ShopCartItem.findOne({ where: { cartId: cart.id, skuId: sku.id, tenantId: tId } })
  if (existing) {
    await existing.update({ qty: existing.qty + input.qty } as never)
  } else {
    await ShopCartItem.create({
      tenantId: tId,
      cartId: cart.id,
      skuId: sku.id,
      spuId: sku.spuId,
      qty: input.qty,
      unitAmountCents,
      currency: cart.currency,
      titleSnapshot: spu ? localize(spu.name, site.defaultLocale) : null,
      specSnapshot: sku.spec ?? null,
    } as never)
  }
  return cart
}

/** 改数量（须属于该购物车） */
export async function updateItemQty(site: StorefrontSite, token: string, itemId: number, qty: number, locale?: string): Promise<ShopCart> {
  const cart = await requireCart(token)
  const item = await ShopCartItem.findOne({ where: { id: itemId, cartId: cart.id, tenantId: tid() } })
  if (!item) throw new AppError(404, '购物车明细不存在')
  if (locale && cart.locale !== locale) await cart.update({ locale } as never)
  void site
  await item.update({ qty } as never)
  return cart
}

/** 删除明细（须属于该购物车） */
export async function removeItem(token: string, itemId: number, locale?: string): Promise<ShopCart> {
  const cart = await requireCart(token)
  const item = await ShopCartItem.findOne({ where: { id: itemId, cartId: cart.id, tenantId: tid() } })
  if (!item) throw new AppError(404, '购物车明细不存在')
  if (locale && cart.locale !== locale) await cart.update({ locale } as never)
  await item.destroy()
  return cart
}

/** 按 token 取购物车（含明细）；token 无效返回 null */
export async function getCart(token: string | undefined): Promise<ShopCart | null> {
  if (!token) return null
  return findCart(token)
}

async function requireCart(token: string): Promise<ShopCart> {
  const cart = token ? await findCart(token) : null
  if (!cart) throw new AppError(404, '购物车不存在')
  return cart
}

export interface CartItemView {
  id: number
  skuId: number
  spuId: number
  qty: number
  title: string | null
  unitAmountCents: number
  currency: string
  available: number
}

export interface CartView {
  token: string
  currency: string
  locale: string | null
  items: CartItemView[]
}

/** 组装购物车视图（含每个 SKU 的实时可用库存） */
export async function toCartView(cart: ShopCart): Promise<CartView> {
  const items = await ShopCartItem.findAll({ where: { cartId: cart.id, tenantId: tid() }, order: [['id', 'ASC']] })
  const views: CartItemView[] = []
  for (const item of items) {
    const available = await inventoryService.available(item.skuId)
    views.push({
      id: item.id,
      skuId: item.skuId,
      spuId: item.spuId,
      qty: item.qty,
      title: item.titleSnapshot,
      unitAmountCents: Number(item.unitAmountCents),
      currency: item.currency,
      available,
    })
  }
  return { token: cart.token, currency: cart.currency, locale: cart.locale, items: views }
}

/**
 * 登录后合并游客购物车到顾客购物车（P3-T03）。
 *
 * 规则：
 * - 仅当 guestToken 指向一个「未归属顾客（customerId 为 null）」的购物车才执行合并；
 *   若游客购物车已绑定某顾客，或 token 无效/缺失，则跳过合并，仅返回（或新建）顾客购物车。
 * - 合并以「行（skuId）」为单元：同 SKU 在两购物车都存在时，**数量累加并封顶 CART_LINE_MAX**，
 *   属性（快照价格/标题/规格）保留顾客购物车既有行，保证冲突有确定优先级且不丢行。
 * - 游客购物车独有的 SKU 整体迁入顾客购物车（数量同样封顶）。
 * - 完成后销毁游客购物车及其明细，返回顾客购物车；整段在事务 + 死锁重试内执行。
 */
export async function mergeCartOnLogin(
  site: StorefrontSite,
  customerId: number,
  guestToken?: string,
): Promise<ShopCart> {
  const tId = tid()
  return withDeadlockRetry(() =>
    sequelize.transaction(async (tx) => {
      // 顾客已有购物车：取最早一条，保证确定性
      let customerCart = await ShopCart.findOne({
        where: { tenantId: tId, customerId },
        order: [['id', 'ASC']],
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      })
      if (!customerCart) {
        customerCart = await ShopCart.create(
          { tenantId: tId, token: genCartToken(), customerId, currency: site.defaultCurrency, locale: site.defaultLocale } as never,
          { transaction: tx },
        )
      }

      if (!guestToken) return customerCart

      const guestCart = await ShopCart.findOne({
        where: { tenantId: tId, token: guestToken, customerId: null },
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      })
      if (!guestCart) return customerCart

      const guestItems = await ShopCartItem.findAll({
        where: { tenantId: tId, cartId: guestCart.id },
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      })

      for (const gi of guestItems) {
        const existing = await ShopCartItem.findOne({
          where: { tenantId: tId, cartId: customerCart.id, skuId: gi.skuId },
          transaction: tx,
        })
        if (existing) {
          // 冲突优先级：既有的顾客行属性优先，仅合并数量并封顶；不丢行
          const merged = Math.min(CART_LINE_MAX, existing.qty + gi.qty)
          await existing.update({ qty: merged } as never, { transaction: tx })
        } else {
          // 游客独有 SKU：整体迁入顾客购物车（数量封顶）
          await ShopCartItem.create(
            {
              tenantId: tId,
              cartId: customerCart.id,
              skuId: gi.skuId,
              spuId: gi.spuId,
              qty: Math.min(CART_LINE_MAX, gi.qty),
              unitAmountCents: gi.unitAmountCents,
              currency: gi.currency,
              titleSnapshot: gi.titleSnapshot,
              specSnapshot: gi.specSnapshot,
            } as never,
            { transaction: tx },
          )
        }
      }

      // 销毁游客购物车及其明细，避免孤儿数据
      await ShopCartItem.destroy({ where: { tenantId: tId, cartId: guestCart.id }, transaction: tx })
      await guestCart.destroy({ transaction: tx })
      return customerCart
    }),
  )
}
