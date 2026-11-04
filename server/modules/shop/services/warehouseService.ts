import { AppError } from '../../../middleware/errorHandler.js'
import { ShopWarehouse, ShopInventory } from '../models/index.js'
import type { CreateWarehouseInput, UpdateWarehouseInput } from '../../../shared/schemas/shop.js'
import { getTenantContext } from '../../../modules/tenant/context.js'

/** 当前租户 ID（读取全局租户上下文，平台超管兜底为 1） */
const tid = (): number => getTenantContext()?.tenantId ?? 1

export async function listWarehouses(params: { page?: number; pageSize?: number; type?: string } = {}) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 20
  const where: Record<string, unknown> = { tenantId: tid() }
  if (params.type && ['bonded', 'overseas', 'direct'].includes(params.type)) where.type = params.type
  const { rows, count } = await ShopWarehouse.findAndCountAll({
    where,
    order: [['id', 'ASC']],
    offset: (page - 1) * pageSize,
    limit: pageSize,
  })
  return { list: rows, total: count, page, pageSize }
}

export async function getWarehouseById(id: number): Promise<ShopWarehouse> {
  const row = await ShopWarehouse.findOne({ where: { id, tenantId: tid() } })
  if (!row) throw new AppError(404, '仓库不存在')
  return row
}

export async function createWarehouse(input: CreateWarehouseInput): Promise<ShopWarehouse> {
  return ShopWarehouse.create({ ...input, tenantId: getTenantContext()?.tenantId ?? 1 } as never)
}

export async function updateWarehouse(id: number, input: UpdateWarehouseInput): Promise<ShopWarehouse> {
  const row = await getWarehouseById(id)
  await row.update(input as never)
  return row
}

export async function deleteWarehouse(id: number): Promise<void> {
  const row = await getWarehouseById(id)
  const used = await ShopInventory.count({ where: { warehouseId: id, tenantId: tid() } })
  if (used > 0) throw new AppError(400, '该仓库已有库存记录，无法删除')
  await row.destroy()
}

export async function options(): Promise<Array<{ id: number; name: string; type: string }>> {
  const rows = await ShopWarehouse.findAll({ where: { tenantId: tid() }, order: [['id', 'ASC']] })
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type }))
}
