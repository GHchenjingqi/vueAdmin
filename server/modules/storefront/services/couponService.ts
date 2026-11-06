import { UniqueConstraintError, type Transaction } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import sequelize from '../../../config/database.js'
import { ShopCoupon, ShopCouponRedemption } from '../../shop/models/index.js'

/**
 * 优惠券校验与占用（T-07 / P3-T07）
 *
 * 复用后台既有 coupons 表（不建第二套促销后端），服务端完成：
 * 存在性 / 生效期 / 最低消费 / 币种一致 / 用量上限 / 折扣封顶，
 * 以及建单时的原子占用与失败补偿（按 orderNo 幂等）。
 *
 * 金额一律整数「分」；DECIMAL 列在 MySQL 下返回字符串，均用 Number() 包裹。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface CouponEvaluation {
  couponId: number
  couponCode: string
  discountCents: number
  currency: string
}

/** MySQL 死锁为可重试瞬态错误（并发占用同一券的行锁） */
function isDeadlock(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { name?: string }).name === 'SequelizeDatabaseError' &&
    /deadlock/i.test((err as { message?: string }).message ?? '')
  )
}

async function withDeadlockRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (err) {
      if (isDeadlock(err) && i < tries - 1) {
        lastErr = err
        continue
      }
      throw err
    }
  }
  throw lastErr
}

/**
 * 校验券码并计算优惠金额（纯读，不产生副作用）。
 * 前端传入的任何折扣金额均被忽略，只以服务端重算结果为准。
 */
export async function evaluateCoupon(
  code: string | undefined,
  ctx: { currency: string; subtotalCents: number },
): Promise<CouponEvaluation | null> {
  if (code === undefined || code === null || code === '') return null
  const normalized = String(code).trim().toUpperCase()
  if (!normalized) return null

  const tId = tid()
  const coupon = await ShopCoupon.findOne({ where: { code: normalized, tenantId: tId } })
  if (!coupon) throw new AppError(404, 'COUPON_NOT_FOUND: 优惠券不存在')

  if (coupon.currency.toUpperCase() !== ctx.currency.toUpperCase()) {
    throw new AppError(400, `COUPON_CURRENCY_MISMATCH: 优惠券币种 ${coupon.currency} 与订单 ${ctx.currency} 不一致`)
  }

  const today = new Date().toISOString().slice(0, 10)
  const from = String(coupon.validFrom).slice(0, 10)
  const to = String(coupon.validTo).slice(0, 10)
  if (today < from) throw new AppError(400, 'COUPON_NOT_ACTIVE: 优惠券尚未生效')
  if (today > to) throw new AppError(400, 'COUPON_EXPIRED: 优惠券已过期')

  const minSpendCents = Math.round(Number(coupon.minSpend) * 100)
  if (ctx.subtotalCents < minSpendCents) {
    throw new AppError(400, `COUPON_MIN_SPEND_NOT_MET: 未达到最低消费 ${coupon.minSpend} ${coupon.currency}`)
  }

  const limit = Number(coupon.usageLimit)
  if (limit > 0 && Number(coupon.usedCount) >= limit) {
    throw new AppError(400, 'COUPON_EXHAUSTED: 优惠券已被用尽')
  }

  const value = Number(coupon.value)
  let discountCents = coupon.type === 'percent'
    ? Math.round((ctx.subtotalCents * value) / 100)
    : Math.round(value * 100)
  discountCents = Math.max(0, Math.min(discountCents, ctx.subtotalCents))
  if (discountCents <= 0) throw new AppError(400, 'COUPON_INVALID_VALUE: 优惠券面额无效')

  // 查询大小写不敏感（MySQL ci collation），但券码一律以库中原值落单/展示，避免与后台对账不一致
  return { couponId: coupon.id, couponCode: coupon.code, discountCents, currency: ctx.currency }
}

/**
 * 建单占用：以 (tenantId, orderNo) 唯一保证幂等，事务内原子递增 usedCount。
 * 与 evaluateCoupon 分离，便于建单失败时按 orderNo 精确回退。
 */
export async function redeemCoupon(evaluation: CouponEvaluation, orderNo: string): Promise<void> {
  const tId = tid()

  /**
   * 幂等重放必须核对券一致。原先只要 (tenantId, orderNo) 有记录就静默成功：
   * 同一订单改用另一张券重放（或并发两请求用了不同券）时，订单按新券折扣展示，
   * 但核销流水与 coupons.usedCount 仍记在旧券上，优惠券对账口径分裂。
   */
  const assertSameCoupon = async (tx?: Transaction): Promise<boolean> => {
    const existing = await ShopCouponRedemption.findOne({
      where: { tenantId: tId, orderNo },
      transaction: tx,
    })
    if (!existing) return false
    if (Number(existing.couponId) !== Number(evaluation.couponId)) {
      throw new AppError(409, `COUPON_REDEMPTION_CONFLICT: 订单 ${orderNo} 已核销其它优惠券`)
    }
    return true
  }

  try {
    await withDeadlockRetry(() =>
      sequelize.transaction(async (tx) => {
        if (await assertSameCoupon(tx)) return

        await ShopCouponRedemption.create(
          {
            tenantId: tId,
            couponId: evaluation.couponId,
            couponCode: evaluation.couponCode,
            orderNo,
            discountCents: evaluation.discountCents,
            currency: evaluation.currency,
          } as never,
          { transaction: tx },
        )

        const [rows] = await sequelize.query(
          'SELECT id, usageLimit, usedCount FROM coupons WHERE id = ? AND tenantId = ? FOR UPDATE',
          { replacements: [evaluation.couponId, tId], transaction: tx },
        )
        const row = (rows as any[])[0]
        if (!row) throw new AppError(404, 'COUPON_NOT_FOUND: 优惠券不存在')
        const limit = Number(row.usageLimit)
        if (limit > 0 && Number(row.usedCount) >= limit) {
          throw new AppError(400, 'COUPON_EXHAUSTED: 优惠券已被用尽')
        }
        await sequelize.query('UPDATE coupons SET usedCount = usedCount + 1, updatedAt = NOW() WHERE id = ? AND tenantId = ?', {
          replacements: [evaluation.couponId, tId],
          transaction: tx,
        })
      }),
    )
  } catch (err) {
    // 并发下同一订单已被占用：仅当胜出者核销的是同一张券才算幂等成功
    if (err instanceof UniqueConstraintError) {
      if (await assertSameCoupon()) return
      throw new AppError(409, `COUPON_REDEMPTION_CONFLICT: 订单 ${orderNo} 并发核销了不同优惠券`)
    }
    throw err
  }
}

/** 建单失败 / 订单取消时回退占用（幂等；无记录则直接返回） */
export async function releaseCoupon(orderNo: string): Promise<void> {
  const tId = tid()
  await withDeadlockRetry(() =>
    sequelize.transaction(async (tx) => {
      const [rows] = await sequelize.query(
        'SELECT id, couponId FROM coupon_redemptions WHERE tenantId = ? AND orderNo = ? FOR UPDATE',
        { replacements: [tId, orderNo], transaction: tx },
      )
      const row = (rows as any[])[0]
      if (!row) return
      await sequelize.query('DELETE FROM coupon_redemptions WHERE id = ? AND tenantId = ?', {
        replacements: [row.id, tId],
        transaction: tx,
      })
      await sequelize.query(
        'UPDATE coupons SET usedCount = usedCount - 1, updatedAt = NOW() WHERE id = ? AND tenantId = ? AND usedCount > 0',
        { replacements: [row.couponId, tId], transaction: tx },
      )
    }),
  )
}
