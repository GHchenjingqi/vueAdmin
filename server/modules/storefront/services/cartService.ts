import crypto from 'crypto'
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
export async function getOrCreateCart(site: StorefrontSite, token?: string, customerId?: number): Promise<ShopCart> {
  let cart: ShopCart | null = null
  if (token) cart = await findCart(token)
  if (!cart) {
    cart = await ShopCart.create({
      tenantId: tid(),
      token: genCartToken(),
      customerId: customerId ?? null,
      currency: site.defaultCurrency,
    } as never)
  }
  return cart
}

/** 加购 / 更新数量（同一 SKU 行内唯一，重复加购累加数量） */
export async function addItem(
  site: StorefrontSite,
  token: string | undefined,
  input: { skuId: number; qty: number },
  customerId?: number,
): Promise<ShopCart> {
  const cart = await getOrCreateCart(site, token, customerId)
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
export async function updateItemQty(site: StorefrontSite, token: string, itemId: number, qty: number): Promise<ShopCart> {
  const cart = await requireCart(token)
  const item = await ShopCartItem.findOne({ where: { id: itemId, cartId: cart.id, tenantId: tid() } })
  if (!item) throw new AppError(404, '购物车明细不存在')
  void site
  await item.update({ qty } as never)
  return cart
}

/** 删除明细（须属于该购物车） */
export async function removeItem(token: string, itemId: number): Promise<ShopCart> {
  const cart = await requireCart(token)
  const item = await ShopCartItem.findOne({ where: { id: itemId, cartId: cart.id, tenantId: tid() } })
  if (!item) throw new AppError(404, '购物车明细不存在')
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
  return { token: cart.token, currency: cart.currency, items: views }
}
