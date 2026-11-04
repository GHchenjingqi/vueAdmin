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
