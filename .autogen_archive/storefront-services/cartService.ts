import { randomBytes } from 'node:crypto'
import { COOKIE_NAME } from './cartConst.js'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopProductPrice, ShopSku, ShopSpu } from '../../shop/models/index.js'
import { ShopCart, ShopCartItem } from '../models/index.js'
import { getActiveCurrency, toCents } from './currencyConfig.js'

/**
 * 购物车（P3-T01）：游客 token（HttpOnly Cookie，不可枚举）；行金额仅展示快照。
 * 服务端校验：SKU 可售（listed/published + SKU active）+ 该币种价格行存在（无行 → 不可售，不换算 C5）。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export function newCartToken(): string {
  return randomBytes(24).toString('hex')
}

export interface CartView {
  token: string
  items: {
    id: number
    skuId: number
    spuId: number
    title: string
    spec: Record<string, string>
    qty: number
    unit: { amount: number; currency: string }
    lineTotal: { amount: number; currency: string }
    sellable: boolean
    stockNote?: string
  }[]
  currency: string
  itemCount: number
}

export async function getOrCreateCart(token: string, currency?: string): Promise<ShopCart> {
  const tenantId = tid()
  const existing = await ShopCart.findOne({ where: { tenantId, token } })
  if (existing) return existing
  const active = currency ?? (await getActiveCurrency()).code
  return ShopCart.create({ tenantId, token, currency: active, version: 0 } as never)
}

export async function presentCart(cart: ShopCart): Promise<CartView> {
  const items = await ShopCartItem.findAll({ where: { tenantId: cart.tenantId, cartId: cart.id }, order: [['id', 'ASC']] })
  return {
    token: cart.token,
    currency: cart.currency,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    items: items.map((i) => ({
      id: i.id,
      skuId: i.skuId,
      spuId: i.spuId,
      title: i.titleSnapshot ?? '',
      spec: i.specSnapshot ?? {},
      qty: i.qty,
      unit: { amount: Number(i.unitAmountCents), currency: i.currency },
      lineTotal: { amount: Number(i.unitAmountCents) * i.qty, currency: i.currency },
      sellable: true,
    })),
  }
}

/** 加购：校验 SKU 可售 + 当前币种价格行（无价格行 → SKU 不可售）；同 SKU 合并数量（上限 10） */
export async function addItem(token: string, skuId: number, qty: number): Promise<CartView> {
  const tenantId = tid()
  const currency = (await getActiveCurrency()).code
  const cart = await getOrCreateCart(token, currency)

  const sku = await ShopSku.findOne({ where: { tenantId, id: skuId } })
  if (!sku || !['listed', 'published'].includes(sku.status)) throw new AppError(404, 'PRODUCT_NOT_FOUND')
  const spu = await ShopSpu.findOne({ where: { tenantId, id: sku.spuId } })
  if (!spu || !['listed', 'published'].includes(spu.status)) throw new AppError(404, 'PRODUCT_NOT_FOUND')
  const priceRow = await ShopProductPrice.findOne({ where: { tenantId, skuId, currency } })
  if (!priceRow) throw new AppError(409, 'SKU_NOT_SELLABLE_IN_CURRENCY')
  const unit = toCents(Number(priceRow.amount))

  const existing = await ShopCartItem.findOne({ where: { tenantId, cartId: cart.id, skuId } })
  if (existing) {
    existing.qty = Math.min(10, existing.qty + qty)
    await existing.save()
  } else {
    await ShopCartItem.create({
      tenantId, cartId: cart.id, skuId, spuId: sku.spuId, qty: Math.min(10, qty),
      unitAmountCents: unit, currency, titleSnapshot: String((spu.name as Record<string, string>)['en-US'] ?? Object.values(spu.name as Record<string, string>)[0] ?? spu.slug ?? `sku-${skuId}`),
      specSnapshot: sku.spec ?? {},
    } as never)
  }
  cart.version += 1
  await cart.save()
  return presentCart(await getOrCreateCart(token, currency))
}

export async function updateItem(token: string, itemId: number, qty: number): Promise<CartView> {
  const tenantId = tid()
  const cart = await ShopCart.findOne({ where: { tenantId, token } })
  if (!cart) throw new AppError(404, 'CART_NOT_FOUND')
  const item = await ShopCartItem.findOne({ where: { tenantId, id: itemId, cartId: cart.id } })
  if (!item) throw new AppError(404, 'CART_ITEM_NOT_FOUND')
  if (qty <= 0) await item.destroy()
  else {
    item.qty = Math.min(10, qty)
    await item.save()
  }
  cart.version += 1
  await cart.save()
  return presentCart(cart)
}

export { COOKIE_NAME }
