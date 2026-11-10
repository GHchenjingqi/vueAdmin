/**
 * 商城后台 API
 *
 * 商品中心（类目/品牌/属性/SPU/SKU/价格/汇率快照），
 * 统一前缀 /shop，风格对齐 src/api/workflow.ts。
 */
import request from '@/utils/request'

// ==================== 通用类型 ====================

/** 多语言文本，如 { "zh-CN": "服饰", "en-US": "Apparel" } */
export type I18nText = Record<string, string>

export interface Paged<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export type ShopStatus = 'draft' | 'review' | 'rejected' | 'listed' | 'published' | 'unlisted' | 'archived'

export interface ShopHealth {
  ok: boolean
  service: string
  time: string
}

// ==================== 健康检查 ====================

export const shopApi = {
  health() {
    return request.get<ShopHealth>('/shop/health')
  },
}

// ==================== 类目 ====================

export interface Category {
  id: number
  parentId: number
  name: I18nText
  level: number
  sort: number
  createdAt?: string
  updatedAt?: string
}

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[]
}

export interface CategoryOption {
  id: number
  parentId: number
  name: string
}

export const categoryApi = {
  tree() {
    return request.get<CategoryTreeNode[]>('/shop/categories')
  },
  options() {
    return request.get<CategoryOption[]>('/shop/categories/options')
  },
  create(data: { parentId: number; name: I18nText; level?: number; sort?: number }) {
    return request.post<Category>('/shop/categories', data)
  },
  update(id: number, data: Partial<{ parentId: number; name: I18nText; sort: number }>) {
    return request.put<Category>(`/shop/categories/${id}`, data)
  },
  remove(id: number) {
    return request.delete<null>(`/shop/categories/${id}`)
  },
}

// ==================== 品牌 ====================

export interface Brand {
  id: number
  name: string
  logo: string | null
  createdAt?: string
  updatedAt?: string
}

export const brandApi = {
  list(params?: { page?: number; pageSize?: number; keyword?: string }) {
    return request.get<Paged<Brand>>('/shop/brands', { params })
  },
  options() {
    return request.get<Array<{ id: number; name: string }>>('/shop/brands/options')
  },
  create(data: { name: string; logo?: string }) {
    return request.post<Brand>('/shop/brands', data)
  },
  update(id: number, data: Partial<{ name: string; logo: string }>) {
    return request.put<Brand>(`/shop/brands/${id}`, data)
  },
  remove(id: number) {
    return request.delete<null>(`/shop/brands/${id}`)
  },
}

// ==================== 属性 ====================

export interface Attribute {
  id: number
  categoryId: number | null
  name: string
  type: 'text' | 'select'
  options: string[] | null
  required: number
  sort: number
}

export const attributeApi = {
  list(params?: { page?: number; pageSize?: number; keyword?: string; categoryId?: number }) {
    return request.get<Paged<Attribute>>('/shop/attributes', { params })
  },
  options(params?: { categoryId?: number }) {
    return request.get<Array<{ id: number; name: string; type: string; options: string[] | null }>>('/shop/attributes/options', { params })
  },
  create(data: { categoryId?: number | null; name: string; type?: 'text' | 'select'; options?: string[] | null; required?: number; sort?: number }) {
    return request.post<Attribute>('/shop/attributes', data)
  },
  update(
    id: number,
    data: Partial<{ categoryId: number | null; name: string; type: 'text' | 'select'; options: string[] | null; required: number; sort: number }>,
  ) {
    return request.put<Attribute>(`/shop/attributes/${id}`, data)
  },
  remove(id: number) {
    return request.delete<null>(`/shop/attributes/${id}`)
  },
}

// ==================== SPU（商品） ====================

export interface Spu {
  id: number
  categoryId: number
  brandId: number | null
  name: I18nText
  description: I18nText | null
  cover: string | null
  images: string[] | null
  status: ShopStatus
  createdAt?: string
  updatedAt?: string
}

export interface SpuDetail {
  spu: Spu
  skus: Sku[]
  allowedActions: ShopStatus[]
}

export type StatusAction = 'submit' | 'withdraw' | 'reject' | 'list' | 'publish' | 'unlist' | 'archive'

export const spuApi = {
  list(params?: { page?: number; pageSize?: number; keyword?: string; categoryId?: number; status?: ShopStatus }) {
    return request.get<Paged<Spu>>('/shop/spus', { params })
  },
  detail(id: number) {
    return request.get<SpuDetail>(`/shop/spus/${id}`)
  },
  create(data: {
    categoryId: number
    brandId?: number | null
    name: I18nText
    description?: I18nText | null
    cover?: string | null
    images?: string[] | null
  }) {
    return request.post<Spu>('/shop/spus', data)
  },
  update(
    id: number,
    data: Partial<{ categoryId: number; brandId: number | null; name: I18nText; description: I18nText | null; cover: string | null; images: string[] | null }>,
  ) {
    return request.put<Spu>(`/shop/spus/${id}`, data)
  },
  changeStatus(id: number, action: StatusAction, reason?: string) {
    return request.post<Spu>(`/shop/spus/${id}/status`, { action, reason })
  },
  remove(id: number) {
    return request.delete<null>(`/shop/spus/${id}`)
  },
}

// ==================== SKU ====================

export interface Sku {
  id: number
  spuId: number
  code: string
  spec: Record<string, string> | null
  barcode: string | null
  originCountry: string | null
  hsCode: string | null
  declaredValue: number | null
  compliance: Record<string, string> | null
  status: ShopStatus
}

export const skuApi = {
  list(params?: { page?: number; pageSize?: number; keyword?: string }) {
    return request.get<Paged<Sku>>('/shop/skus', { params })
  },
  listBySpu(spuId: number) {
    return request.get<Sku[]>(`/shop/spus/${spuId}/skus`)
  },
  create(data: {
    spuId: number
    code: string
    spec?: Record<string, string> | null
    barcode?: string | null
    originCountry?: string | null
    hsCode?: string | null
    declaredValue?: number | null
    compliance?: Record<string, string> | null
  }) {
    return request.post<Sku>('/shop/skus', data)
  },
  update(
    id: number,
    data: Partial<{
      code: string
      spec: Record<string, string> | null
      barcode: string | null
      originCountry: string | null
      hsCode: string | null
      declaredValue: number | null
      compliance: Record<string, string> | null
    }>,
  ) {
    return request.put<Sku>(`/shop/skus/${id}`, data)
  },
  remove(id: number) {
    return request.delete<null>(`/shop/skus/${id}`)
  },
}

// ==================== 价格 ====================

export interface ProductPrice {
  id: number
  skuId: number
  currency: string
  amount: number
  rateSnapshotId: number | null
}

export const priceApi = {
  listBySku(skuId: number) {
    return request.get<ProductPrice[]>(`/shop/skus/${skuId}/prices`)
  },
  upsert(skuId: number, data: { currency: string; amount: number; rateSnapshotId?: number | null }) {
    return request.put<ProductPrice>(`/shop/skus/${skuId}/prices`, data)
  },
  remove(skuId: number, currency: string) {
    return request.delete<null>(`/shop/skus/${skuId}/prices/${currency}`)
  },
}

// ==================== 汇率快照 ====================

export interface RateSnapshot {
  id: number
  baseCurrency: string
  rates: Record<string, number>
  rateDate: string
}

export const rateApi = {
  getSnapshot(params?: { base?: string; date?: string }) {
    return request.get<RateSnapshot>('/shop/rates/snapshot', { params })
  },
  list(params?: { page?: number; pageSize?: number }) {
    return request.get<Paged<RateSnapshot>>('/shop/rates/snapshots', { params })
  },
  save(data: { baseCurrency?: string; rates: Record<string, number>; rateDate: string }) {
    return request.put<RateSnapshot>('/shop/rates/snapshot', data)
  },
}

// ==================== 阶段 2：渠道 ====================

export type ChannelType = 'amazon' | 'shopify' | 'tiktok' | 'shopee' | 'independent'

export interface Channel {
  id: number
  name: string
  type: ChannelType
  status: string
  config: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface ChannelOption {
  id: number
  name: string
  type: ChannelType
}

export const channelApi = {
  list(params?: { page?: number; pageSize?: number }) {
    return request.get<Paged<Channel>>('/shop/channels', { params })
  },
  options() {
    return request.get<ChannelOption[]>('/shop/channels/options')
  },
  detail(id: number) {
    return request.get<Channel>(`/shop/channels/${id}`)
  },
  create(data: { name: string; type: ChannelType; status?: string; config?: Record<string, unknown> | null }) {
    return request.post<Channel>('/shop/channels', data)
  },
  update(id: number, data: Partial<{ name: string; type: ChannelType; status?: string; config?: Record<string, unknown> | null }>) {
    return request.put<Channel>(`/shop/channels/${id}`, data)
  },
  remove(id: number) {
    return request.delete<null>(`/shop/channels/${id}`)
  },
}

// ==================== 阶段 2：店铺 ====================

export interface ShopStore {
  id: number
  channelId: number
  name: string
  status: string
  externalShopId: string | null
  config: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface ShopOption {
  id: number
  channelId: number
  name: string
}

export const shopStoreApi = {
  list(params?: { page?: number; pageSize?: number; channelId?: number }) {
    return request.get<Paged<ShopStore>>('/shop/shops', { params })
  },
  options(params?: { channelId?: number }) {
    return request.get<ShopOption[]>('/shop/shops/options', { params })
  },
  detail(id: number) {
    return request.get<ShopStore>(`/shop/shops/${id}`)
  },
  create(data: { channelId: number; name: string; status?: string; externalShopId?: string | null; config?: Record<string, unknown> | null }) {
    return request.post<ShopStore>('/shop/shops', data)
  },
  update(
    id: number,
    data: Partial<{ channelId: number; name: string; status?: string; externalShopId?: string | null; config?: Record<string, unknown> | null }>,
  ) {
    return request.put<ShopStore>(`/shop/shops/${id}`, data)
  },
  remove(id: number) {
    return request.delete<null>(`/shop/shops/${id}`)
  },
}

// ==================== 阶段 2：渠道商品 ====================

export interface ChannelProduct {
  id: number
  channelId: number
  shopId: number
  spuId: number
  skuId: number | null
  externalId: string | null
  status: 'listed' | 'published'
  createdAt: string
}

export const channelProductApi = {
  list(params?: { page?: number; pageSize?: number; channelId?: number; spuId?: number }) {
    return request.get<Paged<ChannelProduct>>('/shop/channel-products', { params })
  },
  publish(data: { channelId: number; shopId: number; spuId: number; skuId?: number | null }) {
    return request.post<ChannelProduct>('/shop/channel-products', data)
  },
}

// ==================== 阶段 2：提交发布（工作流） ====================

export interface SubmitPublishResult {
  spuId: number
  status: ShopStatus
  instanceId: number | null
}

export const publishApi = {
  submitForPublish(spuId: number) {
    return request.post<SubmitPublishResult>(`/shop/spus/${spuId}/submit-for-publish`)
  },
}

// ==================== 阶段 3：仓库 ====================

export type WarehouseType = 'bonded' | 'overseas' | 'direct'

export interface Warehouse {
  id: number
  name: string
  type: WarehouseType
  country: string
  address: string | null
  createdAt: string
  updatedAt: string
}

export interface WarehouseOption {
  id: number
  name: string
  type: WarehouseType
}

export const warehouseApi = {
  list(params?: { page?: number; pageSize?: number; type?: WarehouseType }) {
    return request.get<Paged<Warehouse>>('/shop/warehouses', { params })
  },
  options() {
    return request.get<WarehouseOption[]>('/shop/warehouses/options')
  },
  detail(id: number) {
    return request.get<Warehouse>(`/shop/warehouses/${id}`)
  },
  create(data: { name: string; type: WarehouseType; country?: string; address?: string | null }) {
    return request.post<Warehouse>('/shop/warehouses', data)
  },
  update(id: number, data: Partial<{ name: string; type: WarehouseType; country?: string; address?: string | null }>) {
    return request.put<Warehouse>(`/shop/warehouses/${id}`, data)
  },
  remove(id: number) {
    return request.delete<null>(`/shop/warehouses/${id}`)
  },
}

// ==================== 阶段 3：库存 ====================

export interface Inventory {
  id: number
  skuId: number
  warehouseId: number
  quantity: number
  locked: number
  updatedAt: string
}

export interface InventoryLog {
  id: number
  skuId: number
  warehouseId: number
  delta: number
  type: 'in' | 'out' | 'lock' | 'unlock'
  reason: string | null
  createdAt: string
}

export const inventoryApi = {
  list(params?: { page?: number; pageSize?: number; skuId?: number; warehouseId?: number }) {
    return request.get<Paged<Inventory>>('/shop/inventory', { params })
  },
  logs(params?: { page?: number; pageSize?: number; skuId?: number; warehouseId?: number }) {
    return request.get<Paged<InventoryLog>>('/shop/inventory/logs', { params })
  },
  adjust(data: { skuId: number; warehouseId: number; delta: number; reason?: string }) {
    return request.post<Inventory>('/shop/inventory/adjust', data)
  },
}

// ==================== 阶段 3：订单 ====================

export type OrderStatus = 'created' | 'paid' | 'fulfilled' | 'shipped' | 'done' | 'cancelled'

export interface OrderBuyer {
  name?: string
  country?: string
  email?: string
  phone?: string
  address?: string
}

export interface Order {
  id: number
  orderNo: string
  channelId: number
  shopId: number
  buyer: OrderBuyer
  currency: string
  amount: number
  status: OrderStatus
  paidAt: string | null
  shippedAt: string | null
  cancelledAt: string | null
  createdAt: string
}

export interface OrderItem {
  id: number
  orderId: number
  skuId: number
  qty: number
  price: number
}

export interface OrderShipment {
  id: number
  orderId: number
  carrier: string
  trackingNo: string | null
  customsNo: string | null
  status: string
  createdAt: string
}

export interface OrderDetail {
  order: Order
  items: OrderItem[]
  shipments: OrderShipment[]
}

export const orderApi = {
  list(params?: { page?: number; pageSize?: number; channelId?: number; status?: OrderStatus }) {
    return request.get<Paged<Order>>('/shop/orders', { params })
  },
  detail(id: number) {
    return request.get<OrderDetail>(`/shop/orders/${id}`)
  },
  create(data: { channelId: number; shopId: number; buyer: OrderBuyer; currency: string; items: { skuId: number; qty: number; price: number }[] }) {
    return request.post<Order>('/shop/orders', data)
  },
  markPaid(id: number) {
    return request.post<Order>(`/shop/orders/${id}/pay`)
  },
  ship(id: number, data?: { carrier?: string; trackingNo?: string }) {
    return request.post<Order>(`/shop/orders/${id}/ship`, data ?? {})
  },
  cancel(id: number) {
    return request.post<Order>(`/shop/orders/${id}/cancel`)
  },
}

// ==================== 阶段 4：营销 ====================

export type PromotionType = 'discount' | 'full_reduce'
export type PromotionScope = 'sku' | 'spu' | 'category' | 'all'

export interface Promotion {
  id: number
  name: I18nText
  type: PromotionType
  scope: PromotionScope
  rule: Record<string, unknown>
  startAt: string
  endAt: string
  createdAt: string
}

export interface Coupon {
  id: number
  code: string
  type: 'fixed' | 'percent'
  value: number
  currency: string
  validFrom: string
  validTo: string
  usedCount: number
  usageLimit: number
  createdAt: string
}

export const marketingApi = {
  listPromotions(params?: { page?: number; pageSize?: number; type?: PromotionType }) {
    return request.get<Paged<Promotion>>('/shop/promotions', { params })
  },
  getPromotion(id: number) {
    return request.get<Promotion>(`/shop/promotions/${id}`)
  },
  createPromotion(data: { name: I18nText; type: PromotionType; scope: PromotionScope; rule: Record<string, unknown>; startAt: string; endAt: string }) {
    return request.post<Promotion>('/shop/promotions', data)
  },
  updatePromotion(id: number, data: Partial<Omit<Promotion, 'id' | 'createdAt'>>) {
    return request.put<Promotion>(`/shop/promotions/${id}`, data)
  },
  removePromotion(id: number) {
    return request.delete<null>(`/shop/promotions/${id}`)
  },
  listCoupons(params?: { page?: number; pageSize?: number }) {
    return request.get<Paged<Coupon>>('/shop/coupons', { params })
  },
  getCoupon(id: number) {
    return request.get<Coupon>(`/shop/coupons/${id}`)
  },
  createCoupon(data: { code: string; type: 'fixed' | 'percent'; value: number; currency: string; validFrom: string; validTo: string; usageLimit?: number }) {
    return request.post<Coupon>('/shop/coupons', data)
  },
  updateCoupon(id: number, data: Partial<Omit<Coupon, 'id' | 'createdAt'>>) {
    return request.put<Coupon>(`/shop/coupons/${id}`, data)
  },
  removeCoupon(id: number) {
    return request.delete<null>(`/shop/coupons/${id}`)
  },
}

// ==================== 阶段 4：数据参谋 ====================

export type AnalyticsDimension = 'day' | 'month' | 'channel' | 'category'

export interface AnalyticsQuery {
  dimension?: AnalyticsDimension
  startAt?: string
  endAt?: string
  channelId?: number
}

export interface SalesRow {
  key: string
  amountByCurrency: Record<string, number>
  usdTotal: number
  orderCount: number
  itemQty: number
}

export interface SalesReport {
  dimension: AnalyticsDimension
  rows: SalesRow[]
}

export interface ProfitPoint {
  key: string
  revenueUSD: number
  costUSD: number
  profitUSD: number
  fxGainLoss: number
}

export interface ProfitReport {
  summary: {
    revenueUSD: number
    costUSD: number
    grossProfitUSD: number
    fxGainLossUSD: number
  }
  series: ProfitPoint[]
}

export interface TurnoverRow {
  skuId: number
  outQty: number
  avgStock: number
  dailyOut: number
  turnoverDays: number
}

export interface TurnoverReport {
  periodDays: number
  rows: TurnoverRow[]
}

export const analyticsApi = {
  sales(query?: AnalyticsQuery) {
    return request.get<SalesReport>('/shop/analytics/sales', { params: query })
  },
  profit(query?: AnalyticsQuery) {
    return request.get<ProfitReport>('/shop/analytics/profit', { params: query })
  },
  turnover(query?: AnalyticsQuery) {
    return request.get<TurnoverReport>('/shop/analytics/turnover', { params: query })
  },
}

// ==================== 币种配置治理（P5-T02 / X-T03） ====================

/**
 * 与后端 `CurrencyConfig`（server/modules/storefront/services/currencyConfig.ts）
 * 及 `currencyConfigSchema` 一一对应。金额一律「最小货币单位」（分），此处只管展示口径。
 */
export interface CurrencyConfig {
  code: string
  symbol: string
  decimalDigits: number
  symbolPosition: 'before' | 'after'
  thousandsSeparator: string
  decimalSeparator: string
  locale: string
}

/** ISO-4217 预设，与后端 ISO_META 白名单保持一致（以后台 settings 为准） */
export const CURRENCY_PRESETS: CurrencyConfig[] = [
  { code: 'USD', symbol: '$', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', locale: 'en-US' },
  { code: 'CNY', symbol: '¥', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', locale: 'zh-CN' },
  { code: 'EUR', symbol: '€', decimalDigits: 2, symbolPosition: 'after', thousandsSeparator: '.', decimalSeparator: ',', locale: 'de-DE' },
  { code: 'GBP', symbol: '£', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', locale: 'en-GB' },
  { code: 'CAD', symbol: 'CA$', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', locale: 'en-CA' },
  { code: 'AUD', symbol: 'A$', decimalDigits: 2, symbolPosition: 'before', thousandsSeparator: ',', decimalSeparator: '.', locale: 'en-AU' },
]

export interface CurrencySetting {
  current: CurrencyConfig | null
  pending: { config: CurrencyConfig; changeId: number; effectiveAt: string } | null
}

export interface CurrencyUpdateResult {
  applied: boolean
  scheduled?: boolean
  changeId: number
}

export interface CurrencyRollbackResult {
  applied: boolean
  changeId: number
  rollbackOf: number
}

export interface ConfigChange {
  id: number
  tenantId: number
  key: string
  oldValue: CurrencyConfig | null
  newValue: CurrencyConfig | null
  operatorId: number | null
  operatorName: string | null
  effectiveAt: string | null
  appliedAt: string | null
  rollbackOf: number | null
  status: 'applied' | 'scheduled' | 'rolled_back'
  createdAt: string
  updatedAt: string
}

export interface CurrencyUpdatePayload {
  config: CurrencyConfig
  /** 后端 schema 为 z.literal(true)：缺失或 false 一律 400 CONFIRMATION_REQUIRED */
  confirmImpact: true
  ackNoConversion: true
  /** ISO 8601 UTC；不传表示立即生效 */
  effectiveAt?: string
}

/**
 * 构造保存请求。二次确认字段由本函数强制写入，页面不能绕过；
 * effectiveAt 统一转 ISO（后端 z.string().datetime() 只接受带时区的时间串）。
 */
export function buildCurrencyUpdatePayload(config: CurrencyConfig, effectiveAt?: string | Date | null): CurrencyUpdatePayload {
  const payload: CurrencyUpdatePayload = {
    config: { ...config, code: config.code.trim().toUpperCase() },
    confirmImpact: true,
    ackNoConversion: true,
  }
  if (effectiveAt) {
    const d = effectiveAt instanceof Date ? effectiveAt : new Date(effectiveAt)
    if (!Number.isNaN(d.getTime())) payload.effectiveAt = d.toISOString()
  }
  return payload
}

export const currencyApi = {
  /** 读取原始配置 + 待生效配置 */
  get() {
    return request.get<CurrencySetting>('/shop/settings/currency')
  },
  /** 读取经 fail-closed 校验后的当前生效配置 */
  active() {
    return request.get<CurrencyConfig>('/shop/settings/currency/active')
  },
  update(payload: CurrencyUpdatePayload) {
    return request.put<CurrencyUpdateResult>('/shop/settings/currency', payload)
  },
  rollback(changeId: number) {
    return request.post<CurrencyRollbackResult>('/shop/settings/currency/rollback', { changeId })
  },
  /** 审计链：最近 50 条，DESC */
  changes() {
    return request.get<ConfigChange[]>('/shop/config-changes')
  },
}
