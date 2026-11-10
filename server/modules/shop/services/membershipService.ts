import { Op, Transaction } from 'sequelize'
import sequelize from '../../../config/database.js'
import { ShopCustomer, ShopMembershipTier, ShopPointsLog } from '../models/index.js'
import Setting from '../../../models/Setting.js'
import { AppError } from '../../../middleware/errorHandler.js'

/**
 * 会员系统（C 端顾客）：等级 / 积分 / 成长值 / 流水。
 * 与后台 admin 用户管理（User/UserRole）完全无关——本服务只操作 customers 体系。
 *
 * 规则（当前内置，后续可配置化）：
 * - 积分：支付成功（captured）按实付金额 发放，1 元 = 1 积分（amount 为分，/100）。
 * - 成长值：每笔实付金额元数累计（1 元 = 1 成长值），只增不减，决定等级。
 * - 等级：租户内 membership_tiers 按 level 升序，取 growthThreshold <= growthValue 的最高级。
 * - 幂等：points_logs uq(tenantId, orderId, reason)——同订单重复回调只发一次。
 * - 异常隔离：发积分失败不得让支付回调重投失败（调用方 catch）。
 */

export interface MembershipView {
  tier: { id: number; name: string; level: number; discountPct: number } | null
  points: number
  growthValue: number
  nextTier: { name: string; level: number; growthThreshold: number; remaining: number } | null
  /** 三维度统计（跨境会员分级：登录频率 / 消费金额 / 消费次数） */
  stats: { loginCount: number; spendAmount: number; orderCount: number; lastLoginAt: string | null }
  /** 各维度达标进度（百分比 0-100，基于当前等级→下一等级门槛） */
  progress: { login: number; spend: number; orders: number }
}

/** 三维度达标判定：0 门槛=不设限（跳过该维度）；any=任一有效维度达标；all=全部有效维度达标；全部维度不设限=达标 */
export function meetsTier(
  tier: { growthThreshold: number; loginFrequency: number; orderCountThreshold: number; matchStrategy?: string | null },
  stats: { loginCount: number; spendAmount: number; orderCount: number },
): boolean {
  const dims = [
    { on: tier.growthThreshold > 0, ok: stats.spendAmount >= tier.growthThreshold },
    { on: tier.loginFrequency > 0, ok: stats.loginCount >= tier.loginFrequency },
    { on: tier.orderCountThreshold > 0, ok: stats.orderCount >= tier.orderCountThreshold },
  ]
  const active = dims.filter((d) => d.on)
  if (active.length === 0) return true // 无任何门槛要求（如普通会员）
  if ((tier.matchStrategy ?? 'any') === 'all') return active.every((d) => d.ok)
  return active.some((d) => d.ok)
}

/** 我的会员视图（等级/积分/成长值/下一级进度/三维度统计） */
export async function getMembership(tenantId: number, customerId: number): Promise<MembershipView> {
  const customer = await ShopCustomer.findOne({ where: { tenantId, id: customerId } })
  if (!customer) throw new AppError(404, '顾客不存在')
  const tiers = await ShopMembershipTier.findAll({ where: { tenantId }, order: [['level', 'ASC']] })
  const stats = {
    loginCount: customer.loginCount ?? 0,
    spendAmount: customer.growthValue ?? 0,
    orderCount: customer.orderCount ?? 0,
    lastLoginAt: customer.lastLoginAt ? customer.lastLoginAt.toISOString() : null,
  }
  const current =
    tiers.find((t) => t.id === customer.membershipTierId) ??
    tiers.filter((t) => meetsTier(t, stats)).sort((a, b) => b.level - a.level)[0] ??
    null
  const next = tiers.find((t) => t.level > (current?.level ?? 0)) ?? null
  const progress = next
    ? {
        login: Math.min(100, Math.round((stats.loginCount / Math.max(1, next.loginFrequency)) * 100)),
        spend: Math.min(100, Math.round((stats.spendAmount / Math.max(1, next.growthThreshold)) * 100)),
        orders: Math.min(100, Math.round((stats.orderCount / Math.max(1, next.orderCountThreshold)) * 100)),
      }
    : { login: 100, spend: 100, orders: 100 }
  return {
    tier: current ? { id: current.id, name: current.name, level: current.level, discountPct: current.discountPct } : null,
    points: customer.points ?? 0,
    growthValue: customer.growthValue ?? 0,
    nextTier: next
      ? { name: next.name, level: next.level, growthThreshold: next.growthThreshold, remaining: Math.max(0, next.growthThreshold - stats.spendAmount) }
      : null,
    stats,
    progress,
  }
}

/** 三维度 → 等级判定（取满足条件的最高级；只升不降）；返回新 tierId 或 null（未变化） */
async function resolveTier(
  tenantId: number,
  stats: { loginCount: number; spendAmount: number; orderCount: number },
  currentTierId: number | null,
): Promise<number | null> {
  const tiers = await ShopMembershipTier.findAll({ where: { tenantId }, order: [['level', 'DESC']] })
  const target = tiers.find((t) => meetsTier(t, stats))
  if (!target) return null
  if (currentTierId === target.id) return null
  const currentTier = currentTierId ? tiers.find((t) => t.id === currentTierId) : null
  // 只升不降（统计只增不减，防御性：手工调级不受此限）
  if (currentTier && target.level < currentTier.level) return null
  return target.id
}

/**
 * 订单支付成功发积分 + 成长值（webhook captured 路径调用；幂等；异常隔离由调用方 catch）。
 * @param paidAmount 实付金额（分）
 */
/** 积分有效期（天）：settings.membership.points_expiry_days；0/缺失=不过期。后台可配。 */
export async function getPointsExpiryDays(tenantId: number): Promise<number> {
  const row = await Setting.findOne({ where: { optionKey: 'membership.points_expiry_days' } })
  const n = Number(row?.optionValue ?? 0)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** 写入后台配置的有效期天数（0=不过期） */
export async function setPointsExpiryDays(tenantId: number, days: number): Promise<void> {
  if (!Number.isInteger(days) || days < 0 || days > 3650) throw new AppError(400, '有效期必须为 0-3650 的整数天（0=不过期）')
  const [row] = await Setting.findOrCreate({ where: { optionKey: 'membership.points_expiry_days' }, defaults: { optionKey: 'membership.points_expiry_days', optionValue: '0' } as never })
  await row.update({ optionValue: String(days) })
}

/** 批次过期时间：发分时点 + N 天（N=0 → NULL 不过期） */
async function batchExpiry(tenantId: number, from: Date): Promise<Date | null> {
  const days = await getPointsExpiryDays(tenantId)
  if (days <= 0) return null
  return new Date(from.getTime() + days * 24 * 3600 * 1000)
}

/**
 * FIFO 消费：按最老未耗尽批次先扣 remaining（行锁防并发）。
 * amount ≤ sum(remaining)（调用方保证：余额 = sum(remaining) - 空批次差值，此处按剩余量优先扣）。
 * 返回实际消费量（应等于 amount；余额与批次不一致时以批次为准并钳制）。
 */
async function consumeFifo(tenantId: number, customerId: number, amount: number, t: Transaction): Promise<number> {
  if (amount <= 0) return 0
  const batches = await ShopPointsLog.findAll({
    where: { tenantId, customerId, remaining: { [Op.gt]: 0 } },
    order: [['expiresAt', 'ASC'], ['id', 'ASC']],
    transaction: t,
    lock: t.LOCK.UPDATE,
  })
  let left = amount
  for (const b of batches) {
    if (left <= 0) break
    const take = Math.min(b.remaining ?? 0, left)
    if (take <= 0) continue
    await b.update({ remaining: (b.remaining ?? 0) - take }, { transaction: t })
    left -= take
  }
  return amount - left
}

/** 正流水 → 新批次（expiresAt 按 settings 天数；回补类批次传 keepForever=true 永不过期） */
async function createBatch(
  tenantId: number,
  customerId: number,
  change: number,
  balanceAfter: number,
  orderId: number | null,
  reason: string,
  keepForever: boolean,
  t: Transaction,
): Promise<void> {
  const expiresAt = keepForever ? null : await batchExpiry(tenantId, new Date())
  await ShopPointsLog.create(
    { tenantId, customerId, change, balanceAfter, orderId, reason, expiresAt, remaining: change } as never,
    { transaction: t },
  )
}

export async function awardPointsForOrder(tenantId: number, orderId: number, customerId: number, paidAmount: number): Promise<void> {
  if (!customerId || paidAmount <= 0) return
  const points = Math.floor(paidAmount / 100) // 1 元 = 1 积分
  const growth = Math.floor(paidAmount / 100) // 1 元 = 1 成长值（=累计消费金额，分级维度）
  if (points <= 0 && growth <= 0) return
  await sequelize.transaction(async (t: Transaction) => {
    // 幂等：uq(tenantId, orderId, reason) 重复回调插入冲突 → 视为已处理
    const dup = await ShopPointsLog.findOne({ where: { tenantId, orderId, reason: 'order_captured' }, transaction: t })
    if (dup) return
    const customer = await ShopCustomer.findOne({ where: { tenantId, id: customerId }, transaction: t, lock: t.LOCK.UPDATE })
    if (!customer) return
    const newPoints = (customer.points ?? 0) + points
    const newGrowth = (customer.growthValue ?? 0) + growth
    const newOrderCount = (customer.orderCount ?? 0) + 1
    const newTierId =
      (await resolveTier(tenantId, { loginCount: customer.loginCount ?? 0, spendAmount: newGrowth, orderCount: newOrderCount }, customer.membershipTierId)) ??
      customer.membershipTierId
    await customer.update({ points: newPoints, growthValue: newGrowth, orderCount: newOrderCount, membershipTierId: newTierId }, { transaction: t })
    await ShopPointsLog.create(
      {
        tenantId,
        customerId,
        change: points,
        balanceAfter: newPoints,
        reason: 'order_captured',
        orderId,
        operatorType: 'system',
      } as never,
      { transaction: t },
    )
    // FIFO 批次：受有效期约束（settings N 天；0=不过期）
    await createBatch(tenantId, customerId, points, newPoints, orderId, 'order_captured_batch', false, t)
  })
}

/** 后台手工调积分（可正可负；流水可溯；负调整不得把余额扣为负） */
export async function adjustPoints(
  tenantId: number,
  customerId: number,
  change: number,
  operator: { type: 'admin'; id: number },
  note?: string,
): Promise<{ points: number }> {
  if (!Number.isInteger(change) || change === 0) throw new AppError(400, '积分变动必须为非零整数')
  return sequelize.transaction(async (t: Transaction) => {
    const customer = await ShopCustomer.findOne({ where: { tenantId, id: customerId }, transaction: t, lock: t.LOCK.UPDATE })
    if (!customer) throw new AppError(404, '顾客不存在')
    const newPoints = (customer.points ?? 0) + change
    if (newPoints < 0) throw new AppError(400, '积分余额不足，不能扣为负数')
    if (change > 0) {
      // 正调整=发分批次（受有效期约束）
      await customer.update({ points: newPoints }, { transaction: t })
      await ShopPointsLog.create(
        {
          tenantId,
          customerId,
          change,
          balanceAfter: newPoints,
          reason: 'manual',
          orderId: null,
          operatorType: operator.type,
          operatorId: operator.id,
          note: note ?? null,
        } as never,
        { transaction: t },
      )
      await createBatch(tenantId, customerId, change, newPoints, null, 'manual_batch', false, t)
      return { points: newPoints }
    }
    // 负调整：FIFO 消费批次
    const consumed = await consumeFifo(tenantId, customerId, -change, t)
    if (consumed <= 0) throw new AppError(400, '积分余额不足，不能扣为负数')
    const finalPoints = (customer.points ?? 0) - consumed
    await customer.update({ points: finalPoints }, { transaction: t })
    await ShopPointsLog.create(
      {
        tenantId,
        customerId,
        change: -consumed,
        balanceAfter: finalPoints,
        reason: 'manual',
        orderId: null,
        operatorType: operator.type,
        operatorId: operator.id,
        note: note ?? null,
      } as never,
      { transaction: t },
    )
    return { points: finalPoints }
  })
}

/** 顾客积分流水（倒序分页） */
export async function listPointsLogs(tenantId: number, customerId: number, page = 1, pageSize = 20) {
  const { rows, count } = await ShopPointsLog.findAndCountAll({
    where: { tenantId, customerId },
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

/** 会员等级列表（后台配置展示用） */
export async function listTiers(tenantId: number) {
  return ShopMembershipTier.findAll({ where: { tenantId }, order: [['level', 'ASC']] })
}

/** 等级 CRUD 输入校验（门槛 >= 0，level 唯一，策略 any/all） */
function validateTierInput(input: {
  name?: string
  level?: number
  growthThreshold?: number
  loginFrequency?: number
  orderCountThreshold?: number
  discountPct?: number
  matchStrategy?: string
}): void {
  if (input.name !== undefined && !String(input.name).trim()) throw new AppError(400, '等级名称不能为空')
  for (const [k, v] of Object.entries({ level: input.level, growthThreshold: input.growthThreshold, loginFrequency: input.loginFrequency, orderCountThreshold: input.orderCountThreshold, discountPct: input.discountPct })) {
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) throw new AppError(400, `${k} 必须为非负数`)
  }
  if (input.matchStrategy !== undefined && !['any', 'all'].includes(input.matchStrategy)) throw new AppError(400, 'matchStrategy 必须为 any/all')
}

/** 新增等级（后台自定义配置门槛） */
export async function createTier(
  tenantId: number,
  input: { name: string; level: number; growthThreshold: number; loginFrequency: number; orderCountThreshold: number; discountPct: number; matchStrategy: string },
): Promise<ShopMembershipTier> {
  validateTierInput(input)
  const dup = await ShopMembershipTier.findOne({ where: { tenantId, level: input.level } })
  if (dup) throw new AppError(400, `等级序号 ${input.level} 已存在`)
  return ShopMembershipTier.create({ tenantId, ...input, name: input.name.trim() } as never)
}

/** 修改等级（门槛/折扣/策略后台可配） */
export async function updateTier(
  tenantId: number,
  tierId: number,
  input: Partial<{ name: string; level: number; growthThreshold: number; loginFrequency: number; orderCountThreshold: number; discountPct: number; matchStrategy: string }>,
): Promise<ShopMembershipTier> {
  validateTierInput(input)
  const tier = await ShopMembershipTier.findOne({ where: { tenantId, id: tierId } })
  if (!tier) throw new AppError(404, '等级不存在')
  if (input.level !== undefined && input.level !== tier.level) {
    const dup = await ShopMembershipTier.findOne({ where: { tenantId, level: input.level } })
    if (dup) throw new AppError(400, `等级序号 ${input.level} 已存在`)
  }
  await tier.update({ ...input, ...(input.name !== undefined ? { name: input.name.trim() } : {}) })
  return tier.reload()
}

/** 删除等级（有顾客挂在该级时拒绝，防止顾客悬空） */
export async function deleteTier(tenantId: number, tierId: number): Promise<void> {
  const tier = await ShopMembershipTier.findOne({ where: { tenantId, id: tierId } })
  if (!tier) throw new AppError(404, '等级不存在')
  const inUse = await ShopCustomer.count({ where: { tenantId, membershipTierId: tierId } })
  if (inUse > 0) throw new AppError(400, `该等级仍有 ${inUse} 个顾客，请先迁移顾客后再删除`)
  await tier.destroy()
}


/**
 * 订单积分抵扣落账（captured 时调用；幂等 uq tenant+order+reason='order_redeem'）。
 * 与 awardPointsForOrder 同一 uq 索引不同 reason，互不冲突。
 * 扣减不得使余额为负（防御：报价已钳制，落账时再核一次）。
 */
export async function redeemPointsForOrder(tenantId: number, orderId: number, customerId: number, pointsUsed: number): Promise<void> {
  if (!customerId || pointsUsed <= 0) return
  await sequelize.transaction(async (t: Transaction) => {
    const dup = await ShopPointsLog.findOne({ where: { tenantId, orderId, reason: 'order_redeem' }, transaction: t })
    if (dup) return
    const customer = await ShopCustomer.findOne({ where: { tenantId, id: customerId }, transaction: t, lock: t.LOCK.UPDATE })
    if (!customer) return
    const deduct = Math.min(pointsUsed, customer.points ?? 0)
    if (deduct <= 0) return
    // FIFO：最老批次先扣（过期优先消耗即将作废的积分）
    const consumed = await consumeFifo(tenantId, customerId, deduct, t)
    if (consumed <= 0) return
    const newPoints = (customer.points ?? 0) - consumed
    await customer.update({ points: newPoints }, { transaction: t })
    await ShopPointsLog.create(
      {
        tenantId,
        customerId,
        change: -consumed,
        balanceAfter: newPoints,
        reason: 'order_redeem',
        orderId,
        operatorType: 'system',
      } as never,
      { transaction: t },
    )
  })
}

/**
 * 退款积分回补（防薅羊毛）：按退款比例处理两笔流水——
 * - 回扣发分：order_captured 发了 X 分，退 r 比例 → 扣 -round(X×r)（reason=refund_clawback_R{refundNo}）
 * - 回补抵扣：order_redeem 扣了 Y 分，退 r 比例 → 补 +round(Y×r)（reason=refund_redeemback_R{refundNo}）
 * reason 带 refundNo → uq(tenant,order,reason) 天然防同笔退款重复回补；多次部分退款各自独立回补。
 * 余额钳制：回扣不得超过当前余额（防御）；异常由调用方 catch 隔离。
 */
export async function refundClawback(
  tenantId: number,
  orderId: number,
  customerId: number,
  refundNo: string,
  refundRatio: number,
): Promise<void> {
  if (!customerId || refundRatio <= 0) return
  const ratio = Math.min(1, refundRatio)
  await sequelize.transaction(async (t: Transaction) => {
    const [earnedLog, redeemLog] = await Promise.all([
      ShopPointsLog.findOne({ where: { tenantId, orderId, reason: 'order_captured' }, transaction: t }),
      ShopPointsLog.findOne({ where: { tenantId, orderId, reason: 'order_redeem' }, transaction: t }),
    ])
    const clawback = earnedLog ? Math.round(Math.abs(earnedLog.change) * ratio) : 0
    const redeemback = redeemLog ? Math.round(Math.abs(redeemLog.change) * ratio) : 0
    if (clawback <= 0 && redeemback <= 0) return
    const customer = await ShopCustomer.findOne({ where: { tenantId, id: customerId }, transaction: t, lock: t.LOCK.UPDATE })
    if (!customer) return
    const entries: { reason: string; change: number }[] = []
    if (clawback > 0) entries.push({ reason: `refund_clawback_R${refundNo}`, change: -clawback })
    if (redeemback > 0) entries.push({ reason: `refund_redeemback_R${refundNo}`, change: redeemback })
    let points = customer.points ?? 0
    for (const entry of entries) {
      if (entry.change < 0) {
        // 回扣：FIFO 消费批次，钳制余额
        const deduct = Math.min(-entry.change, points)
        if (deduct <= 0) continue
        const consumed = await consumeFifo(tenantId, customerId, deduct, t)
        if (consumed <= 0) continue
        points -= consumed
        await ShopPointsLog.create(
          {
            tenantId,
            customerId,
            change: -consumed,
            balanceAfter: points,
            reason: entry.reason.slice(0, 64),
            orderId,
            operatorType: 'system',
          } as never,
          { transaction: t },
        )
      } else {
        // 回补：补偿性质批次，永不过期
        points += entry.change
        await ShopPointsLog.create(
          {
            tenantId,
            customerId,
            change: entry.change,
            balanceAfter: points,
            reason: entry.reason.slice(0, 64),
            orderId,
            operatorType: 'system',
          } as never,
          { transaction: t },
        )
        await createBatch(tenantId, customerId, entry.change, points, orderId, entry.reason.slice(0, 64) + '_batch', true, t)
      }
    }
    if (points !== (customer.points ?? 0)) await customer.update({ points }, { transaction: t })
  })
}

/**
 * 过期作废任务：扫 expiresAt < now 且 remaining > 0 的批次 →
 * 余额扣减（钳制）+ 冲销负流水（reason=expired_E{批次id}，findOne 幂等）+ 批次 remaining=0。
 * 由 sweeper 定时调用（每 5 分钟）+ 后台手动触发。
 */
export async function expireExpiredPoints(tenantId: number, batchSize = 200): Promise<{ expiredCustomers: number; expiredPoints: number }> {
  const due = await ShopPointsLog.findAll({
    where: { tenantId, remaining: { [Op.gt]: 0 }, expiresAt: { [Op.lt]: new Date() } },
    order: [['id', 'ASC']],
    limit: batchSize,
  })
  if (due.length === 0) return { expiredCustomers: 0, expiredPoints: 0 }
  const byCustomer = new Map<number, number>()
  for (const batch of due) byCustomer.set(batch.customerId, (byCustomer.get(batch.customerId) ?? 0) + (batch.remaining ?? 0))
  let expiredPoints = 0
  for (const [customerId, rawTotal] of byCustomer) {
    await sequelize.transaction(async (t: Transaction) => {
      const customer = await ShopCustomer.findOne({ where: { tenantId, id: customerId }, transaction: t, lock: t.LOCK.UPDATE })
      if (!customer) return
      // 重新锁批次（防并发消耗后剩余量变化）
      const fresh = await ShopPointsLog.findAll({
        where: { tenantId, customerId, remaining: { [Op.gt]: 0 }, expiresAt: { [Op.lt]: new Date() } },
        transaction: t,
        lock: t.LOCK.UPDATE,
      })
      const totalDue = fresh.reduce((n, b) => n + (b.remaining ?? 0), 0)
      if (totalDue <= 0) return
      // 余额钳制：作废量不得超过当前余额（余额可能已被消费）
      const deduct = Math.min(totalDue, customer.points ?? 0)
      if (deduct <= 0) {
        // 余额已耗尽但批次未清：清零批次（不再欠账）
        for (const b of fresh) await b.update({ remaining: 0 }, { transaction: t })
        return
      }
      // FIFO 消费过期部分（先扣最老的过期批次）
      let left = deduct
      for (const b of fresh) {
        if (left <= 0) break
        const take = Math.min(b.remaining ?? 0, left)
        await b.update({ remaining: (b.remaining ?? 0) - take }, { transaction: t })
        left -= take
      }
      const newPoints = (customer.points ?? 0) - deduct
      await customer.update({ points: newPoints }, { transaction: t })
      await ShopPointsLog.create(
        {
          tenantId,
          customerId,
          change: -deduct,
          balanceAfter: newPoints,
          reason: `expired_${new Date().toISOString().slice(0, 10)}`.slice(0, 64),
          orderId: null,
          operatorType: 'system',
          note: `积分到期作废 ${deduct} 分`,
        } as never,
        { transaction: t },
      )
      expiredPoints += deduct
    })
  }
  return { expiredCustomers: byCustomer.size, expiredPoints }
}

/** 过期扫描器（进程级定时；每 5 分钟逐租户执行；unref 不挂进程退出） */
export function startPointsExpiryScanner(intervalMs = 5 * 60 * 1000, tenantIds?: number[]): () => void {
  const timer = setInterval(async () => {
    try {
      const tenants = tenantIds?.length ? tenantIds : [1]
      for (const tenantId of tenants) {
        const r = await expireExpiredPoints(tenantId)
        if (r.expiredPoints > 0) console.log(`[points-expiry] tenant=${tenantId} 作废 ${r.expiredPoints} 分（${r.expiredCustomers} 人）`)
      }
    } catch (err) {
      console.warn('[points-expiry] 扫描失败：', err instanceof Error ? err.message : err)
    }
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}

/** 顾客登录钩子：loginCount+1、lastLoginAt、按三维度重算等级（异常不阻断登录） */export async function recordLogin(tenantId: number, customerId: number): Promise<void> {
  try {
    const customer = await ShopCustomer.findOne({ where: { tenantId, id: customerId } })
    if (!customer) return
    const loginCount = (customer.loginCount ?? 0) + 1
    const newTierId =
      (await resolveTier(tenantId, { loginCount, spendAmount: customer.growthValue ?? 0, orderCount: customer.orderCount ?? 0 }, customer.membershipTierId)) ??
      customer.membershipTierId
    await customer.update({ loginCount, lastLoginAt: new Date(), membershipTierId: newTierId })
  } catch (err) {
    console.warn('[membership] 登录统计失败（不阻断登录）：', err instanceof Error ? err.message : err)
  }
}

/** 后台手工调级（直改 tierId；与三维度统计解耦，管理员权限） */
export async function setTier(tenantId: number, customerId: number, tierId: number | null): Promise<void> {
  const customer = await ShopCustomer.findOne({ where: { tenantId, id: customerId } })
  if (!customer) throw new AppError(404, '顾客不存在')
  if (tierId !== null) {
    const tier = await ShopMembershipTier.findOne({ where: { tenantId, id: tierId } })
    if (!tier) throw new AppError(404, '等级不存在')
  }
  await customer.update({ membershipTierId: tierId })
}

/** 未消费过（growthValue=0）且无流水的顾客——后台列表筛选用 */
export async function countIdleCustomers(tenantId: number): Promise<number> {
  return ShopCustomer.count({ where: { tenantId, growthValue: 0, points: { [Op.eq]: 0 } } })
}

/**
 * 批量重算全体顾客等级（门槛配置变更后由管理端触发）：
 * - 分批（500/批）处理，避免长事务锁表；
 * - 与单顾客判定一致：meetsTier 取满足条件最高级，只升不降（门槛提高不降级，防御性产品决策）；
 * - 返回 { scanned, upgraded }，upgraded=实际变更等级的顾客数。
 */
export async function recalculateAllTiers(
  tenantId: number,
  options: { batchSize?: number; allowDemote?: boolean } = {},
): Promise<{ scanned: number; upgraded: number; demoted: number }> {
  const batchSize = options.batchSize ?? 500
  const allowDemote = options.allowDemote ?? false
  const tiers = await ShopMembershipTier.findAll({ where: { tenantId }, order: [['level', 'DESC']] })
  if (tiers.length === 0) return { scanned: 0, upgraded: 0, demoted: 0 }
  let scanned = 0
  let upgraded = 0
  let demoted = 0
  let lastId = 0
  for (;;) {
    const batch = await ShopCustomer.findAll({
      where: { tenantId, id: { [Op.gt]: lastId } },
      attributes: ['id', 'membershipTierId', 'loginCount', 'growthValue', 'orderCount'],
      order: [['id', 'ASC']],
      limit: batchSize,
    })
    if (batch.length === 0) break
    for (const customer of batch) {
      lastId = customer.id
      scanned += 1
      const stats = { loginCount: customer.loginCount ?? 0, spendAmount: customer.growthValue ?? 0, orderCount: customer.orderCount ?? 0 }
      const target = tiers.find((t) => meetsTier(t, stats))
      if (!target) continue
      const currentTier = customer.membershipTierId ? tiers.find((t) => t.id === customer.membershipTierId) : null
      if (currentTier && target.id === currentTier.id) continue
      if (currentTier && target.level < currentTier.level) {
        // 降级：仅 allowDemote（strict 模式）执行；默认只升不降（防御性）
        if (!allowDemote) continue
        await customer.update({ membershipTierId: target.id })
        demoted += 1
        continue
      }
      await customer.update({ membershipTierId: target.id })
      upgraded += 1
    }
  }
  return { scanned, upgraded, demoted }
}
