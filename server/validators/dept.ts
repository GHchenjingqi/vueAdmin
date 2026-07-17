import { z } from 'zod'

/** 创建部门 */
export const createDeptSchema = z.object({
  parentId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1, '部门名称不能为空').max(50, '部门名称最多50个字符'),
  sort: z.number().int().min(0).max(9999).default(0),
  leader: z.string().max(50).optional().default(''),
  phone: z.string().max(20).optional().default(''),
  email: z.string().max(100).optional().default(''),
  status: z.number().int().min(0).max(1).default(1),
})

/** 更新部门 */
export const updateDeptSchema = createDeptSchema.partial()

/** 部门查询参数 */
export const deptQuerySchema = z.object({
  scope: z.enum(['options']).optional(),
})