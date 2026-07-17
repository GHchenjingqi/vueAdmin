import { z } from 'zod'
import { statusField, sortField, paginationSchema } from './common.js'

export const createDictTypeSchema = z.object({
  name: z.string().min(1, '字典名称不能为空').max(50),
  code: z.string().min(1, '字典编码不能为空').max(50),
  status: statusField,
  description: z.string().max(255).optional(),
})

export const updateDictTypeSchema = createDictTypeSchema.partial()

export const createDictDataSchema = z.object({
  typeId: z.number().int().positive(),
  label: z.string().min(1, '字典标签不能为空').max(100),
  value: z.string().min(1, '字典值不能为空').max(100),
  sort: sortField,
  status: statusField,
  cssClass: z.string().max(50).optional(),
  listClass: z.string().max(50).optional(),
})

export const updateDictDataSchema = createDictDataSchema.partial()

export const dictDataQuerySchema = paginationSchema.extend({
  dictType: z.string().min(1).optional(),
  scope: z.enum(['options']).optional(),
})

export const dictTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  status: z.number(),
  description: z.string().optional(),
  createdAt: z.string().optional(),
})

export const dictDataSchema = z.object({
  id: z.number(),
  typeId: z.number(),
  label: z.string(),
  value: z.string(),
  sort: z.number().optional(),
  status: z.number(),
  cssClass: z.string().optional(),
  listClass: z.string().optional(),
})

export type CreateDictTypeInput = z.infer<typeof createDictTypeSchema>
export type UpdateDictTypeInput = z.infer<typeof updateDictTypeSchema>
export type CreateDictDataInput = z.infer<typeof createDictDataSchema>
export type UpdateDictDataInput = z.infer<typeof updateDictDataSchema>
export type DictType = z.infer<typeof dictTypeSchema>
export type DictData = z.infer<typeof dictDataSchema>