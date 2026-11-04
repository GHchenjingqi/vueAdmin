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
  })
  .passthrough()

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
