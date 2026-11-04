import { AppError } from '../../../middleware/errorHandler.js'
import { ShopShop, ShopChannel } from '../models/index.js'
import type { CreateShopInput, UpdateShopInput } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

export async function listShops(params: { channelId?: number; page?: number; pageSize?: number } = {}) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where: Record<string, unknown> = { tenantId: tid() }
  if (params.channelId) where.channelId = params.channelId
  const { rows, count } = await ShopShop.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

export async function getShopById(id: number): Promise<ShopShop> {
  const row = await ShopShop.findOne({ where: { id, tenantId: tid() } })
  if (!row) throw new AppError(404, '店铺不存在')
  return row
}

export async function createShop(input: CreateShopInput): Promise<ShopShop> {
  const channel = await ShopChannel.findOne({ where: { id: input.channelId, tenantId: tid() } })
  if (!channel) throw new AppError(400, '所属渠道不存在')
  return ShopShop.create({ ...input, tenantId: getTenantContext()?.tenantId ?? 1 } as never)
}

export async function updateShop(id: number, input: UpdateShopInput): Promise<ShopShop> {
  const row = await getShopById(id)
  if (input.channelId && input.channelId !== row.channelId) {
    const channel = await ShopChannel.findOne({ where: { id: input.channelId, tenantId: tid() } })
    if (!channel) throw new AppError(400, '所属渠道不存在')
  }
  await row.update(input as never)
  return row
}

export async function deleteShop(id: number): Promise<void> {
  const row = await getShopById(id)
  await row.destroy()
}

export async function options(params: { channelId?: number } = {}): Promise<Array<{ id: number; name: string; channelId: number }>> {
  const where: Record<string, unknown> = { tenantId: tid() }
  if (params.channelId) where.channelId = params.channelId
  const rows = await ShopShop.findAll({ where, order: [['id', 'ASC']] })
  return rows.map((r) => ({ id: r.id, name: r.name, channelId: r.channelId }))
}
