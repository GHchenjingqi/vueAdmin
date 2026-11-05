import { z } from 'zod'

/**
 * Storefront C 端顾客认证 Schema（Zod）
 *
 * 公开接口的注册/登录是外部可触达表单，必须严格校验 email / password；
 * 同时沿用 storefront 约定（validate 中间件整体替换 body），故用 .passthrough()
 * 容忍多余字段而不报错。
 *
 * password 上限 72：bcrypt 对超过 72 字节的输入会静默截断，前端约束避免不一致。
 */

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('邮箱格式不正确').max(255),
    password: z.string().min(8, '密码至少 8 位').max(72, '密码过长'),
    nickname: z.string().trim().max(64).optional(),
  })
  .passthrough()

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('邮箱格式不正确').max(255),
    password: z.string().min(1, '请输入密码').max(72),
    // 登录时携带的游客购物车令牌：用于把游客购物车合并进顾客购物车（P3-T03）
    cartToken: z.string().trim().min(1).max(64).optional(),
  })
  .passthrough()

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>

/**
 * P4-T02 地址簿（C 端顾客自助维护，需顾客 JWT）
 *
 * - country 强制 ISO-3166-1 alpha-2 并归一化为大写（与配送白名单、订单收货地址同口径）；
 * - customerId / tenantId **不在输入内**：归属一律取 JWT，杜绝越权写入他人地址；
 * - 多余字段由 z.object 默认剥离，validate 中间件会把净化后的对象回写 req.body。
 */
export const customerAddressSchema = z.object({
  fullName: z.string().trim().min(1, '收件人不能为空').max(120),
  phone: z.string().trim().min(1, '联系电话不能为空').max(32),
  country: z
    .string()
    .trim()
    .length(2, '国家码须为两位 ISO 3166-1 alpha-2')
    .regex(/^[A-Za-z]{2}$/, '国家码须为两位字母')
    .transform((v) => v.toUpperCase()),
  province: z.string().trim().min(1, '省/州不能为空').max(64),
  city: z.string().trim().min(1, '城市不能为空').max(64),
  address1: z.string().trim().min(1, '详细地址不能为空').max(255),
  address2: z.string().trim().max(255).nullable().optional(),
  postcode: z.string().trim().min(1, '邮编不能为空').max(20),
  isDefault: z.boolean().optional(),
})

/** 新增地址（isDefault 省略时：首条地址自动成为默认） */
export const createAddressSchema = customerAddressSchema
export type CreateAddressInput = z.infer<typeof createAddressSchema>

/** 编辑地址（局部更新，至少带一个字段） */
export const updateAddressSchema = customerAddressSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: '至少需要提交一个待修改字段',
})
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>

/** 路径参数：地址 id */
export const addressIdParamSchema = z
  .object({
    id: z.coerce.number().int().positive(),
  })
  .passthrough()
export type AddressIdParamInput = z.infer<typeof addressIdParamSchema>
