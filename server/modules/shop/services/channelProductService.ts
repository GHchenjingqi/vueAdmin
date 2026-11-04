import { AppError } from '../../../middleware/errorHandler.js'
import { ShopChannelProduct, ShopSpu, ShopSku, ShopChannel, ShopShop } from '../models/index.js'
import { checkSpuCompliance } from './complianceService.js'
import { push } from './channelAdapter.js'
import { getTenantContext } from '../../../modules/tenant/context.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

export async function listChannelProducts(params: { channelId?: number; shopId?: number; spuId?: number; page?: number; pageSize?: number } = {}) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where: Record<string, unknown> = { tenantId: tid() }
  if (params.channelId) where.channelId = params.channelId
  if (params.shopId) where.shopId = params.shopId
  if (params.spuId) where.spuId = params.spuId
  const { rows, count } = await ShopChannelProduct.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

export async function getChannelProductById(id: number): Promise<ShopChannelProduct> {
  const row = await ShopChannelProduct.findOne({ where: { id, tenantId: tid() } })
  if (!row) throw new AppError(404, '渠道商品不存在')
  return row
}

/**
 * 发布到渠道（阶段 2.5）。
 * 1) 合规卡点：每个 SKU 必须齐备 hs_code / origin_country / declared_value；
 * 2) 调用渠道适配器 push（本期 mock），写入 channel_products（status=listed）。
 */
export async function publishToChannel(
  spuId: number,
  channelId: number,
  shopId: number,
  options: { skuId?: number; requiredQualifications?: string[] } = {},
): Promise<ShopChannelProduct> {
  const spu = await ShopSpu.findOne({ where: { id: spuId, tenantId: tid() } })
  if (!spu) throw new AppError(404, '商品不存在')
  if (spu.status !== 'published') {
    throw new AppError(400, '仅已发布的商品可发布到渠道')
  }

  const channel = await ShopChannel.findOne({ where: { id: channelId, tenantId: tid() } })
  if (!channel) throw new AppError(400, '渠道不存在')
  const shop = await ShopShop.findOne({ where: { id: shopId, tenantId: tid() } })
  if (!shop) throw new AppError(400, '店铺不存在')
  if (shop.channelId !== channelId) throw new AppError(400, '店铺不属于该渠道')

  if (options.skuId) {
    const sku = await ShopSku.findOne({ where: { id: options.skuId, spuId, tenantId: tid() } })
    if (!sku) throw new AppError(400, 'SKU 不属于该商品')
  }

  // 合规卡点（发布前必须过）
  const result = await checkSpuCompliance(spuId, options.requiredQualifications)
  if (!result.ok) {
    const detail = result.missing
      .map((m) => `SKU[${m.skuCode}] 缺失: ${m.fields.join('、')}`)
      .join('; ')
    throw new AppError(400, `合规校验未通过: ${detail}`)
  }

  const pushResult = await push(channelId, { spuId, channelId, shopId, skuId: options.skuId ?? null })

  // 已存在则更新（同一商品同一店铺同一 SKU 维度幂等）
  const [row, _created] = await ShopChannelProduct.findOrCreate({
    where: {
      tenantId: tid(),
      channelId,
      shopId,
      spuId,
      skuId: options.skuId ?? null,
    },
    defaults: {
      tenantId: tid(),
      channelId,
      shopId,
      spuId,
      skuId: options.skuId ?? null,
      externalId: pushResult.externalId,
      status: 'listed',
    } as never,
  })
  if (!_created) {
    await row.update({ externalId: pushResult.externalId, status: 'listed' })
  }
  return row
}

/** 审批通过后更新渠道商品为 published（由工作流回调触发） */
export async function markChannelProductsPublished(spuId: number, channelId?: number, shopId?: number): Promise<number> {
  const where: Record<string, unknown> = { tenantId: tid(), spuId, status: 'listed' }
  if (channelId) where.channelId = channelId
  if (shopId) where.shopId = shopId
  const [count] = await ShopChannelProduct.update({ status: 'published' }, { where })
  return count
}
