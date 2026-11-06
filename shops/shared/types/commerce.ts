import type { Money } from './currency'

/** 购物车与报价（契约见 docs/API_CONTRACT.md §2.3/§2.4） */
export interface CartItem {
  id: number
  skuId: number
  spuId: number
  title: string
  spec: Record<string, string>
  qty: number
  unit: Money
  lineTotal: Money
  sellable: boolean
  stockNote?: string
}

export interface Cart {
  token: string
  items: CartItem[]
  currency: string
  /** 购物车语言快照（P5-T01）：与币种互不推导，仅记录用户加购时的语言 */
  locale?: string
  itemCount: number
}

export interface QuoteTotals {
  subtotal: Money
  discount: Money
  shipping: Money
  tax: Money
  total: Money
}

export interface ShippingRate {
  id: string
  name: string
  amount: Money
  etaDays: string
}

export interface Quote {
  quoteId: string
  version: number
  expiresAt: string
  currency: string
  items: { skuId: number; title: string; qty: number; unit: Money; lineTotal: Money }[]
  totals: QuoteTotals
  shippingRates: ShippingRate[]
  appliedCoupon?: { code: string; discount: Money } | null
  warnings: string[]
  /** P5-T04：按仓配送承诺（路由后的主仓，天） */
  deliveryCommitment?: { warehouseId: number; warehouseName: string; warehouseType: string; deliveryEstimateDays: number } | null
}

export interface OrderDraft {
  orderNo: string
  id: number
  accessToken: string
  status: string
  paymentStatus: string
  totals: QuoteTotals
  currency: string
  email: string
  createdAt: string
}

export interface OrderDetail extends OrderDraft {
  items: { skuId: number; title: string; spec: Record<string, string>; qty: number; unit: Money; lineTotal: Money }[]
  shippingAddress: Record<string, string>
}
