import crypto from 'crypto'
import { Op } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopNewsletter, ShopRestockSubscription, ShopSku } from '../../shop/models/index.js'
import * as inventoryService from '../../shop/services/inventoryService.js'
import type { StorefrontSite } from '../middleware/siteContext.js'

/**
 * 订阅与到货通知服务（阶段 5 步骤 5 / 步骤 5 首个切片）
 *
 * 复用 shop 模型层（newsletters / restock_subscriptions），不复制数据、不建第二套后端。
 * 公开接口免 admin 鉴权，租户由 siteContext 注入（service 层显式 tenantId 兜底为 1）。
 * 实际邮件发送由后续营销/邮件任务消费（P4-T09），本层只负责落库、幂等与补货触发收口。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

/** 生成不可枚举令牌（48 位 hex） */
function genToken(): string {
  return crypto.randomBytes(24).toString('hex')
}

export interface NewsletterResult {
  status: string
  token: string
}

/** 订阅邮件简报：租户内同邮箱幂等（已退订则重新订阅） */
export async function subscribeNewsletter(
  site: StorefrontSite,
  input: { email: string; source?: string; locale?: string },
): Promise<NewsletterResult> {
  const tId = tid()
  const email = input.email.trim().toLowerCase()
  const [row, created] = await ShopNewsletter.findOrCreate({
    where: { tenantId: tId, email },
    defaults: {
      tenantId: tId,
      email,
      status: 'subscribed',
      source: input.source ?? null,
      locale: input.locale ?? site.defaultLocale,
      token: genToken(),
      subscribedAt: new Date(),
    } as never,
  })
  if (!created && row.status !== 'subscribed') {
    await row.update({
      status: 'subscribed',
      source: input.source ?? row.source,
      locale: input.locale ?? row.locale,
      subscribedAt: new Date(),
      unsubscribedAt: null,
    } as never)
  }
  return { status: row.status, token: row.token }
}

/** 凭令牌退订（邮件一键退订链接） */
export async function unsubscribeNewsletter(
  _site: StorefrontSite,
  token: string,
): Promise<{ status: string }> {
  const row = await ShopNewsletter.findOne({ where: { tenantId: tid(), token } })
  if (!row || row.status === 'unsubscribed') throw new AppError(404, '订阅记录不存在或已退订')
  await row.update({ status: 'unsubscribed', unsubscribedAt: new Date() } as never)
  return { status: 'unsubscribed' }
}

export interface RestockResult {
  status: string
  token: string
  inStock: boolean
}

/** 订阅到货提醒：校验 SKU 存在，租户内同邮箱同 SKU 幂等 */
export async function subscribeRestock(
  site: StorefrontSite,
  input: { email: string; skuId: number; locale?: string },
): Promise<RestockResult> {
  const tId = tid()
  const email = input.email.trim().toLowerCase()
  const sku = await ShopSku.findOne({ where: { id: input.skuId, tenantId: tId } })
  if (!sku) throw new AppError(404, `SKU ${input.skuId} 不存在`)
  const [row, created] = await ShopRestockSubscription.findOrCreate({
    where: { tenantId: tId, email, skuId: input.skuId },
    defaults: {
      tenantId: tId,
      email,
      skuId: input.skuId,
      spuId: sku.spuId,
      status: 'waiting',
      token: genToken(),
      locale: input.locale ?? site.defaultLocale,
    } as never,
  })
  if (!created && row.status !== 'waiting') {
    await row.update({ status: 'waiting', notifiedAt: null } as never)
  }
  const inStock = (await inventoryService.available(input.skuId)) > 0
  return { status: row.status, token: row.token, inStock }
}

export interface RestockNotifyTarget {
  email: string
  token: string
  locale: string | null
}

/**
 * 库存补货后触发：把关心的「等待中」订阅标记为已通知，返回待发送邮件列表（去重）。
 * 实际邮件发送由后续营销/邮件任务消费（P4-T09）。
 */
export async function notifyRestock(skuId: number, tenantId: number): Promise<RestockNotifyTarget[]> {
  const subs = await ShopRestockSubscription.findAll({ where: { skuId, tenantId, status: 'waiting' } })
  if (subs.length === 0) return []
  await ShopRestockSubscription.update(
    { status: 'notified', notifiedAt: new Date() },
    { where: { id: { [Op.in]: subs.map((s) => s.id) } } } as never,
  )
  return subs.map((s) => ({ email: s.email, token: s.token, locale: s.locale }))
}

// 库存补货钩子注册：保持 shop → storefront 单向依赖，避免反向 import
inventoryService.setRestockHook(async (skuId, tenantId) => {
  await notifyRestock(skuId, tenantId)
})
