import { z } from 'zod'
import { statusField, paginationSchema } from './common.js'

export const createUserSchema = z.object({
  username: z.string().min(2, '用户名至少2个字符').max(20, '用户名最多20个字符'),
  password: z.string().min(8, '密码长度不能少于8位').optional(),
  nickname: z.string().max(30).optional(),
  email: z.string().email('邮箱格式不正确').optional(),
  phone: z.string().max(20).optional(),
  deptId: z.number().int().positive().nullable().optional(),
  roleIds: z.array(z.number().int().positive()).optional(),
  status: statusField,
  remark: z.string().max(255).optional(),
})

export const updateUserSchema = createUserSchema.partial().omit({ password: true })

export const userQuerySchema = paginationSchema.extend({
  username: z.string().optional(),
  nickname: z.string().optional(),
  phone: z.string().optional(),
  deptId: z.coerce.number().int().positive().optional(),
  export: z.string().optional(),
})

export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  nickname: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  avatar: z.string().optional(),
  bio: z.string().optional(),
  status: z.number(),
  deptId: z.number().nullable().optional(),
  departmentId: z.number().nullable().optional(),
  roles: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  passwordResetRequired: z.boolean().optional(),
  lastLoginAt: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type UserQueryInput = z.infer<typeof userQuerySchema>
export type User = z.infer<typeof userSchema>