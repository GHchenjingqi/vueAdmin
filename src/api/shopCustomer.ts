import request from '@/utils/request'
import type { PaginatedData } from '@/types/response'

/** 会员系统（C 端顾客）管理接口——与用户管理（B 端 admin users）是两套体系，勿混用 */
export interface ShopCustomerRow {
  id: number
  email: string
  nickname: string | null
  status: 'active' | 'blocked'
  membershipTierId: number | null
  points: number
  growthValue: number
  orderCount: number
  loginCount: number
  lastLoginAt: string | null
  referralCode: string | null
  createdAt: string
}

export interface CustomerMembershipView {
  tier: { id: number; name: string; level: number; discountPct: number } | null
  points: number
  growthValue: number
  nextTier: { name: string; level: number; growthThreshold: number; remaining: number } | null
  stats: { loginCount: number; spendAmount: number; orderCount: number; lastLoginAt: string | null }
  progress: { login: number; spend: number; orders: number }
}

export interface PointsLogRow {
  id: number
  change: number
  balanceAfter: number
  reason: string
  orderId: number | null
  operatorType: string
  note: string | null
  createdAt: string
}

export const shopCustomerApi = {
  /** 顾客列表（关键字/状态过滤 + 分页） */
  list(params: { page?: number; pageSize?: number; keyword?: string; status?: string }) {
    return request.get<PaginatedData<ShopCustomerRow>>('/shop/customers', { params })
  },

  /** 详情：顾客 + 会员视图 + 积分流水 */
  getById(id: number, logsPage = 1) {
    return request.get<{ customer: ShopCustomerRow; membership: CustomerMembershipView; pointsLogs: { list: PointsLogRow[]; total: number } }>(
      `/shop/customers/${id}`,
      { params: { logsPage } },
    )
  },

  /** 启用/禁用（blocked 无法登录前台） */
  updateStatus(id: number, status: 'active' | 'blocked') {
    return request.patch(`/shop/customers/${id}/status`, { status })
  },

  /** 手工调积分（正=发放 负=扣减；流水可溯） */
  adjustPoints(id: number, change: number, note?: string) {
    return request.post<{ id: number; points: number }>(`/shop/customers/${id}/points`, { change, note })
  },
}

/** 营销邮件（对会员/用户群发） */
export const shopMailApi = {
  list(params: { page?: number; pageSize?: number }) {
    return request.get<{ list: unknown[]; total: number }>('/mail-campaigns', { params })
  },
  audienceStats() {
    return request.get<{ customers: number; users: number }>('/mail-campaigns/audience-stats')
  },
  create(input: { subject: string; body: string; audienceType: string; audienceParam?: string }) {
    return request.post<{ campaign: unknown; recipientCount: number }>('/mail-campaigns', input)
  },
  send(id: number) {
    return request.post<{ sent: number; failed: number; total: number }>(`/mail-campaigns/${id}/send`)
  },
  recipients(id: number) {
    return request.get<{ list: { email: string; recipientType: string; status: string; error: string | null }[]; total: number }>(
      `/mail-campaigns/${id}/recipients`,
    )
  },
  /** 会员等级列表（受众选择用） */
  tiers() {
    return request.get<{ id: number; name: string; growthThreshold: number }[]>('/membership-tiers')
  },
}

/** 会员等级 CRUD（后台自定义三维度门槛） */
export const membershipTierApi = {
  list() {
    return request.get<
      {
        id: number
        name: string
        level: number
        growthThreshold: number
        loginFrequency: number
        orderCountThreshold: number
        discountPct: number
        matchStrategy: string
      }[]
    >('/membership-tiers')
  },
  create(input: {
    name: string
    level: number
    growthThreshold: number
    loginFrequency: number
    orderCountThreshold: number
    discountPct: number
    matchStrategy: string
  }) {
    return request.post('/membership-tiers', input)
  },
  update(
    id: number,
    patch: Partial<{
      name: string
      level: number
      growthThreshold: number
      loginFrequency: number
      orderCountThreshold: number
      discountPct: number
      matchStrategy: string
    }>,
  ) {
    return request.put(`/membership-tiers/${id}`, patch)
  },
  remove(id: number) {
    return request.delete(`/membership-tiers/${id}`)
  },
  /** 门槛变更后批量重算全体顾客等级（allowDemote=true 严格执行新门槛含降级） */
  recalculate(allowDemote = false) {
    return request.post<{ scanned: number; upgraded: number; demoted: number }>('/membership-tiers/recalculate', { allowDemote })
  },
  /** 积分有效期（天；0=不过期） */
  getExpiry() {
    return request.get<{ days: number }>('/membership-tiers/expiry')
  },
  setExpiry(days: number) {
    return request.put<{ days: number }>('/membership-tiers/expiry', { days })
  },
  /** 手动触发过期作废 */
  expireNow() {
    return request.post<{ expiredCustomers: number; expiredPoints: number }>('/membership-tiers/expire-now')
  },
}
