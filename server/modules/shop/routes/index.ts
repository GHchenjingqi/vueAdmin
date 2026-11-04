import { Router } from 'express'

/**
 * 商城后台模块路由
 *
 * 统一前缀 /api/v1/shop（在 server/routes/index.ts 挂载）。
 * 阶段 0 仅提供健康检查；阶段 1 起按域挂载子路由：
 * categories / brands / attributes / products / channels / inventory / orders ...
 */
const router = Router()

/**
 * GET /shop/health
 * 商城模块健康检查（联调用，阶段 0 占位）
 */
router.get('/health', (_req, res) => {
  res.json({ code: 0, data: { ok: true, service: 'shop', time: new Date().toISOString() } })
})

export default router
