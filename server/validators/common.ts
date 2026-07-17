import { z } from 'zod'

/** 分页查询参数 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(9999).default(10),
  keyword: z.string().optional(),
  status: z.coerce.number().int().min(0).max(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

/** ID 路径参数 */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/** 状态字段（0=禁用, 1=启用） */
export const statusField = z.number().int().min(0).max(1).default(1)

/** 排序字段 */
export const sortField = z.number().int().min(0).max(9999).default(0)