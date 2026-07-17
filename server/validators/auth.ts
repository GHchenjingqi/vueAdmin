import { z } from 'zod'

/** 登录参数 */
export const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空').max(50),
  password: z.string().min(1, '密码不能为空'),
  captchaId: z.string().optional(),
  captchaText: z.string().optional(),
  rememberMe: z.boolean().optional().default(false),
})

/** 密码强度校验 */
export const passwordSchema = z
  .string()
  .min(8, '密码长度不能少于8位')
  .regex(/[A-Z]/, '密码必须包含至少一个大写字母')
  .regex(/[a-z]/, '密码必须包含至少一个小写字母')
  .regex(/[0-9]/, '密码必须包含至少一个数字')
  .regex(/[^A-Za-z0-9]/, '密码必须包含至少一个特殊字符')

/** 修改密码 */
export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '原密码不能为空'),
  newPassword: passwordSchema,
}).refine(data => data.oldPassword !== data.newPassword, {
  message: '新密码不能与原密码相同',
  path: ['newPassword'],
})

/** 重置密码（使用 Token） */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, '重置令牌不能为空'),
  newPassword: passwordSchema,
})

/** 刷新 Token */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken 不能为空'),
})

/** 注册参数 */
export const registerSchema = z.object({
  username: z.string().min(2, '用户名至少2个字符').max(20, '用户名最多20个字符'),
  password: passwordSchema,
  email: z.string().email('邮箱格式不正确'),
  phone: z.string().optional(),
})