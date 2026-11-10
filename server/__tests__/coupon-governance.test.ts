// @vitest-environment node
/**
 * 优惠券后台治理链路（创建 / 改码 / 删除 / 用量上限）实证
 *
 * 历轮 T-07 只覆盖「校验与占用」(evaluateCoupon/redeemCoupon/releaseCoupon)，
 * 后台 CRUD 侧从未审计。本文件按真实 HTTP 链路建模：
 *   validate 中间件用 schema.parse(req.body) 并回填 req.body（zod 默认 strip 未知字段）
 *   → marketingController → marketingService。
 *
 * 期望行为（修复前跑红即为缺陷证据）：
 *  D1 已产生核销流水的券禁止物理删除（否则用量上限可被「删除+同码重建」绕过、流水悬空）
 *  D2 后台能设置 usageLimit，且服务端用量上限真正生效
 *  D3 券码统一 trim + 大写，规范化后的码可用于报价
 *  D4 并发创建同码券只有一个成功，另一个返回 400 而不是未捕获的 500
 *  D5 usageLimit 不得改到低于已核销次数
 *  D6 已有核销流水的券不得改券码（否则历史流水 code 与券定义分裂）
 */
import { describe, it, expect } from 'vitest'
import { runInTenant } from '../modules/tenant/context.js'
import { ShopCoupon, ShopCouponRedemption } from '../modules/shop/models/index.js'
import * as marketingService from '../modules/shop/services/marketingService.js'
import * as couponService from '../modules/storefront/services/couponService.js'
import { createCouponSchema, updateCouponSchema } from '../shared/schemas/shop.js'
import { AppError } from '../middleware/errorHandler.js'

const TID = 1
const uniq = (): string => `gov${Date.now()}${Math.floor(Math.random() * 1e6)}`
const day = (offset: number): string => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}
const inTenant = <T>(fn: () => Promise<T>): Promise<T> => runInTenant({ tenantId: TID }, fn)

/** 模拟后台 HTTP 入参（未经校验），与前端表单字段一致 */
const rawInput = (code: string, extra: Record<string, unknown> = {}) => ({
  code,
  type: 'fixed',
  value: 10,
  minSpend: 0,
  currency: 'USD',
  validFrom: day(-1),
  validTo: day(1),
  ...extra,
})

/** 走 validate 中间件的等价路径：schema.parse 会 strip 未知字段并应用默认值 */
const parsedInput = (code: string, extra: Record<string, unknown> = {}) =>
  createCouponSchema.parse(rawInput(code, extra)) as Record<string, unknown>

const evaluate = (code: string) =>
  couponService.evaluateCoupon(code, { currency: 'USD', subtotalCents: 10000 })

describe('优惠券后台治理链路', () => {
  it('D1 已有核销流水的券禁止删除，券与流水都保留', async () => {
    await inTenant(async () => {
      const code = 'C' + uniq()
      const coupon = await marketingService.createCoupon(parsedInput(code) as never)
      const ev = await evaluate(code)
      await couponService.redeemCoupon(ev!, 'GOV-D1-' + uniq())

      await expect(marketingService.deleteCoupon(coupon.id)).rejects.toThrow(/核销|REDEMPTION|redeemed/)
      expect(await ShopCoupon.findByPk(coupon.id)).not.toBeNull()
      expect(await ShopCouponRedemption.count({ where: { couponId: coupon.id, tenantId: TID } })).toBe(1)
    })
  })

  it('D2 后台设置的 usageLimit 能落库，且第二次核销被用量上限拒绝', async () => {
    await inTenant(async () => {
      const code = 'C' + uniq()
      const parsed = parsedInput(code, { usageLimit: 1 })
      expect(parsed.usageLimit).toBe(1)

      const coupon = await marketingService.createCoupon(parsed as never)
      expect(Number(coupon.usageLimit)).toBe(1)

      const ev = await evaluate(code)
      await couponService.redeemCoupon(ev!, 'GOV-D2-A-' + uniq())
      await expect(couponService.redeemCoupon(ev!, 'GOV-D2-B-' + uniq())).rejects.toThrow(/COUPON_EXHAUSTED/)
    })
  })

  it('D3 券码 trim + 大写规范化，规范化后的码可用于报价', async () => {
    await inTenant(async () => {
      const raw = ' mix' + uniq() + ' '
      const coupon = await marketingService.createCoupon(parsedInput(raw) as never)
      expect(coupon.code).toBe(raw.trim().toUpperCase())

      const ev = await evaluate(raw.trim().toLowerCase())
      expect(ev?.couponId).toBe(coupon.id)
    })
  })

  it('D4 并发创建同码券只成功一个，另一个是 400 而非未捕获 500', async () => {
    await inTenant(async () => {
      const code = 'C' + uniq()
      const results = await Promise.allSettled([
        marketingService.createCoupon(parsedInput(code) as never),
        marketingService.createCoupon(parsedInput(code) as never),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
      expect(rejected).toBeDefined()
      expect(rejected!.reason).toBeInstanceOf(AppError)
      expect((rejected!.reason as AppError).statusCode).toBe(400)
    })
  })

  it('D5 usageLimit 不得改到低于已核销次数', async () => {
    await inTenant(async () => {
      const code = 'C' + uniq()
      const coupon = await marketingService.createCoupon(parsedInput(code, { usageLimit: 5 }) as never)
      for (let i = 0; i < 3; i++) {
        const ev = await evaluate(code)
        await couponService.redeemCoupon(ev!, `GOV-D5-${i}-` + uniq())
      }
      const fresh = await ShopCoupon.findByPk(coupon.id)
      expect(Number(fresh?.usedCount)).toBe(3)

      // 走真实 validate 链路：.partial() 叠加 .default(0) 后不能把字段吞掉
      const parsedUpdate = updateCouponSchema.parse({ usageLimit: 2 })
      expect(parsedUpdate.usageLimit).toBe(2)
      await expect(marketingService.updateCoupon(coupon.id, parsedUpdate as never)).rejects.toThrow(/已使用|USED_COUNT|usageLimit/)
    })
  })

  it('D6 已有核销流水的券不得改券码', async () => {
    await inTenant(async () => {
      const code = 'C' + uniq()
      const coupon = await marketingService.createCoupon(parsedInput(code) as never)
      const ev = await evaluate(code)
      await couponService.redeemCoupon(ev!, 'GOV-D6-' + uniq())

      await expect(marketingService.updateCoupon(coupon.id, { code: 'C' + uniq() } as never)).rejects.toThrow(/核销|REDEMPTION|券码/)
      const fresh = await ShopCoupon.findByPk(coupon.id)
      // 券码落库统一 trim+大写，改码被拒后仍保持规范化后的原值
      expect(fresh?.code).toBe(code.trim().toUpperCase())
    })
  })
})
