import type { Money } from './currency'

/** 统一错误结构（P1-T09）：code/message/requestId 三层贯穿 */
export interface ApiErrorBody {
  code: string
  message: string
  requestId?: string
}

export class ApiError extends Error {
  code: string
  status: number
  requestId?: string

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.code = body.code
    this.status = status
    this.requestId = body.requestId
  }
}

/** 目录商品（C 端裁剪字段，来自 /api/catalog/*） */
export interface CatalogProduct {
  id: number
  slug: string
  title: string
  description: string
  cover: string | null
  images: string[]
  category: { id: number; name: string; slug: string } | null
  price: Money | null
  inStock: boolean
  variants: CatalogVariant[]
  categoryKind?: 'wig' | 'apparel'
}

export interface CatalogVariant {
  id: number
  code: string
  spec: Record<string, string>
  price: Money | null
  inStock: boolean
  stockNote?: string
}

export interface CatalogCategory {
  id: number
  slug: string
  name: string
  level: number
  kind: 'wig' | 'apparel' | 'other'
  children: CatalogCategory[]
}

export interface ProductListResult {
  list: CatalogProduct[]
  total: number
  page: number
  pageSize: number
}
