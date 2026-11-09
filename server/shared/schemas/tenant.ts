import { z } from 'zod'
import { paginationSchema } from './common.js'

/** 租户状态：1=启用 0=禁用 2=冻结，与 paginationSchema 的 0/1 布尔状态语义不同 */
export const tenantStatusSchema = z.object({ status: z.coerce.number().int().min(0).max(2) })

export const tenantQuerySchema = paginationSchema.extend({
  name: z.string().max(100).optional(),
  code: z.string().max(50).optional(),
  status: z.coerce.number().int().min(0).max(2).optional(),
})

export const tenantBrandSchema = z.object({
  title: z.string().max(100).optional(),
  logo: z.string().max(255).optional(),
  color: z.string().max(30).optional(),
})

export const provisionTenantSchema = z.object({
  name: z.string().min(2, '租户名称至少 2 个字符').max(100),
  code: z.string().regex(/^[a-z][a-z0-9-]{1,29}$/, '租户编码需为小写字母开头的 2-30 位字母、数字或连字符'),
  planId: z.coerce.number().int().positive().optional(),
  expiresAt: z.string().optional(),
  deptName: z.string().max(50).optional(),
  brand: tenantBrandSchema.optional(),
  admin: z.object({
    username: z.string().min(2, '管理员用户名至少 2 个字符').max(20),
    nickname: z.string().max(30).optional(),
    email: z.string().email('邮箱格式不正确').optional(),
    phone: z.string().max(20).optional(),
    // 复杂度规则（大小写/数字/符号）由服务端 validatePasswordStrength 统一裁决，这里只兜长度
    password: z.string().min(8, '密码长度不能少于8位'),
  }),
})

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  brand: tenantBrandSchema.optional(),
  planId: z.coerce.number().int().positive().optional(),
  expiresAt: z.string().nullable().optional(),
})

export type TenantQueryInput = z.infer<typeof tenantQuerySchema>
export type ProvisionTenantInput = z.infer<typeof provisionTenantSchema>
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>
