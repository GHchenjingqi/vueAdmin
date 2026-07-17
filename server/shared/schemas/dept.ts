import { z } from 'zod'
import { statusField, sortField } from './common.js'

export const createDeptSchema = z.object({
  parentId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1, '部门名称不能为空').max(50, '部门名称最多50个字符'),
  sort: sortField,
  leader: z.string().max(50).optional().default(''),
  phone: z.string().max(20).optional().default(''),
  email: z.string().max(100).optional().default(''),
  status: statusField,
})

export const updateDeptSchema = createDeptSchema.partial()

export const deptQuerySchema = z.object({
  scope: z.enum(['options']).optional(),
})

export type Department = {
  id: number
  name: string
  parentId?: number | null
  sort?: number
  leader?: string
  phone?: string
  email?: string
  status: number
  children?: Department[]
}

export const departmentSchema: z.ZodType<Department> = z.object({
  id: z.number(),
  name: z.string(),
  parentId: z.number().nullable().optional(),
  sort: z.number().optional(),
  leader: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  status: z.number(),
  children: z.lazy(() => z.array(departmentSchema).optional()),
})