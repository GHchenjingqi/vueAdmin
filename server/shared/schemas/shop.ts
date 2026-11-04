import { z } from 'zod'

/**
 * 商城后台共享 Schema（Zod）
 *
 * 阶段 0 占位：阶段 1 起按域补充
 * category / brand / attribute / spu / sku / price / channel 等校验 schema，
 * 作为前后端共享的类型单一来源（对齐 workflow.ts 的组织方式）。
 */

/** 商城模块健康检查响应 */
export const shopHealthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  time: z.string(),
})

export type ShopHealth = z.infer<typeof shopHealthSchema>
