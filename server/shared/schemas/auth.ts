import { z } from 'zod'

export const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空').max(50),
  password: z.string().min(1, '密码不能为空'),
  captchaKey: z.string().optional(),
  captchaText: z.string().optional(),
  rememberMe: z.boolean().optional().default(false),
})

export const passwordSchema = z
  .string()
  .min(8, '密码长度不能少于8位')
  .regex(/[A-Z]/, '密码必须包含至少一个大写字母')
  .regex(/[a-z]/, '密码必须包含至少一个小写字母')
  .regex(/[0-9]/, '密码必须包含至少一个数字')
  .regex(/[^A-Za-z0-9]/, '密码必须包含至少一个特殊字符')

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '原密码不能为空'),
  newPassword: passwordSchema,
}).refine(data => data.oldPassword !== data.newPassword, {
  message: '新密码不能与原密码相同',
  path: ['newPassword'],
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1, '重置令牌不能为空'),
  newPassword: passwordSchema,
})

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken 不能为空'),
})

export const registerSchema = z.object({
  username: z.string().min(2, '用户名至少2个字符').max(20, '用户名最多20个字符'),
  password: passwordSchema,
  email: z.string().email('邮箱格式不正确'),
  phone: z.string().optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type RegisterInput = z.infer<typeof registerSchema>