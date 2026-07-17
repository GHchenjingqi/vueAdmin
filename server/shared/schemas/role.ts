import { z } from 'zod'
import { statusField, sortField, paginationSchema } from './common.js'

export const createRoleSchema = z.object({
  name: z.string().min(1, '角色名称不能为空').max(30),
  code: z.string().min(1, '角色编码不能为空').max(50),
  sort: sortField,
  status: statusField,
  dataScope: z.number().int().min(1).max(3).default(1),
  remark: z.string().max(255).optional(),
  menuIds: z.array(z.number().int().positive()).optional(),
})

export const updateRoleSchema = createRoleSchema.partial()

export const roleQuerySchema = paginationSchema.extend({
  name: z.string().optional(),
})

export const roleSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  sort: z.number().optional(),
  status: z.number(),
  dataScope: z.number().optional(),
  remark: z.string().optional(),
  menuIds: z.array(z.number()).optional(),
  menus: z.array(z.object({ id: z.number() })).optional(),
  createdAt: z.string().optional(),
})

export type CreateRoleInput = z.infer<typeof createRoleSchema>
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>
export type RoleQueryInput = z.infer<typeof roleQuerySchema>
export type Role = z.infer<typeof roleSchema>