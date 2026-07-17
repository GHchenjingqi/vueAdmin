import { z } from 'zod'
import { statusField, sortField } from './common.js'

export const createMenuSchema = z.object({
  parentId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1, '菜单名称不能为空').max(50),
  type: z.enum(['M', 'C', 'F']),
  path: z.string().max(200).optional(),
  component: z.string().max(200).optional(),
  icon: z.string().max(50).optional(),
  sort: sortField,
  permission: z.string().max(100).optional(),
  visible: z.boolean().default(true),
  keepAlive: z.boolean().default(false),
  status: statusField,
})

export const updateMenuSchema = createMenuSchema.partial()

export const menuQuerySchema = z.object({
  scope: z.enum(['tree', 'options', 'admin']).optional(),
})

export type Menu = {
  id: number
  name: string
  type: 'M' | 'C' | 'F'
  path?: string
  component?: string
  icon?: string
  sort?: number
  parentId?: number | null
  permission?: string
  visible?: boolean
  keepAlive?: boolean
  status?: number
  children?: Menu[]
}

export const menuSchema: z.ZodType<Menu> = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(['M', 'C', 'F']),
  path: z.string().optional(),
  component: z.string().optional(),
  icon: z.string().optional(),
  sort: z.number().optional(),
  parentId: z.number().nullable().optional(),
  permission: z.string().optional(),
  visible: z.boolean().optional(),
  keepAlive: z.boolean().optional(),
  status: z.number().optional(),
  children: z.lazy(() => z.array(menuSchema).optional()),
})

export type CreateMenuInput = z.infer<typeof createMenuSchema>
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>