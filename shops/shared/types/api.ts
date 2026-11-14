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
  /** 视频地址列表（本地 /uploads/ 或 CDN）；为空则详情页仅显示图片。真实后台未迁移/videos 缺省时 undefined */
  videos?: string[]
  category: { id: number; name: string; slug: string } | null
  price: Money | null
  inStock: boolean
  variants: CatalogVariant[]
  categoryKind?: 'wig' | 'apparel'
  /** 已审核评价均分（保留 2 位）；无评价为 null */
  ratingAvg?: number | null
  /** 已审核评价数量 */
  reviewCount?: number
  /** 后台 per-product SEO 字段（真实后端契约提供；mock fixtures 可缺省） */
  seo?: { title: string; description: string } | null
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
