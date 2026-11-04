import { AppError } from '../../../middleware/errorHandler.js'
import { ShopChannel, ShopShop } from '../models/index.js'
import type { CreateChannelInput, UpdateChannelInput, ChannelType } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

export async function listChannels(params: { page?: number; pageSize?: number } = {}) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const { rows, count } = await ShopChannel.findAndCountAll({
    where: { tenantId: tid() },
    order: [['id', 'DESC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

export async function getChannelById(id: number): Promise<ShopChannel> {
  const row = await ShopChannel.findOne({ where: { id, tenantId: tid() } })
  if (!row) throw new AppError(404, '渠道不存在')
  return row
}

export async function createChannel(input: CreateChannelInput): Promise<ShopChannel> {
  return ShopChannel.create({ ...input, tenantId: getTenantContext()?.tenantId ?? 1 } as never)
}

export async function updateChannel(id: number, input: UpdateChannelInput): Promise<ShopChannel> {
  const row = await getChannelById(id)
  await row.update(input as never)
  return row
}

export async function deleteChannel(id: number): Promise<void> {
  const row = await getChannelById(id)
  const shopCount = await ShopShop.count({ where: { channelId: id, tenantId: tid() } })
  if (shopCount > 0) throw new AppError(400, '该渠道下存在店铺，无法删除')
  await row.destroy()
}

export async function options(): Promise<Array<{ id: number; name: string; type: ChannelType }>> {
  const rows = await ShopChannel.findAll({ where: { tenantId: tid() }, order: [['id', 'ASC']] })
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type }))
}
