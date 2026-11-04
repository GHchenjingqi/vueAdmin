import { ShopChannel, ShopShop } from '../models/index.js'
import type { ChannelType } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'

/**
 * 渠道适配器（阶段 2.5 抽象层，本期 mock 实现）。
 *
 * 统一接口 push / pull / status，为后续接入 Amazon / TikTok Shop / Shopify 等真实平台 API 预留。
 * 真实适配器应按 channel.type 实现各自的签名/加解密逻辑。
 */

export interface ChannelPushResult {
  externalId: string
  status: 'listed' | 'published'
}

export interface LogisticsResult {
  trackingNo: string
  carrier: string
}

const tid = (): number => getTenantContext()?.tenantId ?? 1

/** 推送商品到渠道（mock：仅记录并返回假 externalId） */
export async function push(channelId: number, payload: Record<string, unknown>): Promise<ChannelPushResult> {
  const channel = await ShopChannel.findOne({ where: { id: channelId, tenantId: tid() } })
  const type: ChannelType = (channel?.type as ChannelType) ?? 'independent'
  const externalId = `${type}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  // TODO(阶段4): 按 channel.type 替换为各平台真实 API
  return { externalId, status: 'listed' }
}

/** 从渠道拉取商品状态（mock：返回占位） */
export async function pull(_channelId: number, _externalId: string): Promise<Record<string, unknown>> {
  return { synced: true, pulledAt: new Date().toISOString() }
}

/** 查询渠道商品状态（mock） */
export async function status(_channelId: number, _externalId: string): Promise<string> {
  return 'active'
}

/**
 * 物流对接（阶段 3.5）：本期对接 1 家（mock），返回运单号。
 * 报关字段 customs_no 由 complianceService 依据 SKU 的 hs_code/origin_country/declared_value 自动填充，
 * 不在本函数内处理。
 */
export async function createShipment(order: { carrier: string; shopId: number; channelId: number }): Promise<LogisticsResult> {
  const shop = await ShopShop.findOne({ where: { id: order.shopId, tenantId: tid() } })
  const carrier = order.carrier || shop?.name || 'mock-carrier'
  const trackingNo = `MOCK-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  // TODO(阶段4): 替换为 4PX / 云途等真实物流商 API
  return { trackingNo, carrier }
}
