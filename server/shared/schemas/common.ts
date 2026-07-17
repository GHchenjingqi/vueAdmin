import { z } from 'zod'

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  keyword: z.string().optional(),
  status: z.coerce.number().int().min(0).max(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const statusField = z.number().int().min(0).max(1).default(1)

export const sortField = z.number().int().min(0).max(9999).default(0)

export type PaginationInput = z.infer<typeof paginationSchema>
export type IdParam = z.infer<typeof idParamSchema>