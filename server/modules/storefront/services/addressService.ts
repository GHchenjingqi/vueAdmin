import { Op } from 'sequelize'
import type { Transaction } from 'sequelize'
import { AppError } from '../../../middleware/errorHandler.js'
import sequelize from '../../../config/database.js'
import { ShopCustomerAddress } from '../../shop/models/index.js'
import type { CreateAddressInput, UpdateAddressInput } from '../../../shared/schemas/customer.js'

/**
 * 顾客地址簿（P4-T02 / 门禁 T-10）
 *
 * 安全口径：
 * - 归属**只**来自已校验的顾客 JWT（tenantId + customerId），接口不接受任何归属字段；
 * - 所有读写都带 tenantId + customerId 双条件，查不到一律 404（不泄漏「地址存在但非本人」）；
 * - 写操作先 `SELECT ... FOR UPDATE` 锁顾客行，串行化同一顾客的地址变更，
 *   保证并发新增/设默认时「有且只有一个默认地址」。
 *
 * 默认地址兜底（验收项）：
 * - 首条地址自动成为默认；
 * - 删除默认地址 → 自动把剩余最新一条提升为默认；删空后新建仍自动默认；
 * - 显式把默认地址改成非默认 → 自动把另一条提升为默认；只有一条时保持默认（不可无默认）。
 */

export interface AddressOwner {
  tenantId: number
  customerId: number
}

export interface AddressView {
  id: number
  fullName: string
  phone: string
  country: string
  province: string
  city: string
  address1: string
  address2: string | null
  postcode: string
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

function toView(row: ShopCustomerAddress): AddressView {
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    country: row.country,
    province: row.province,
    city: row.city,
    address1: row.address1,
    address2: row.address2,
    postcode: row.postcode,
    isDefault: Number(row.isDefault) === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function scope(owner: AddressOwner) {
  return { tenantId: owner.tenantId, customerId: owner.customerId }
}

/**
 * 以顾客行为串行锁开启写事务。
 * 顾客行不存在 / 租户不符时 403，避免孤儿地址或跨租户写入。
 */
async function withOwnerLock<T>(owner: AddressOwner, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return sequelize.transaction(async (tx) => {
    const [rows] = await sequelize.query('SELECT id FROM customers WHERE id = ? AND tenantId = ? FOR UPDATE', {
      replacements: [owner.customerId, owner.tenantId],
      transaction: tx,
    })
    if ((rows as unknown[]).length === 0) throw new AppError(403, 'ADDRESS_OWNER_INVALID: 顾客不存在或租户不匹配')
    return fn(tx)
  })
}

async function findOwned(owner: AddressOwner, id: number, tx?: Transaction): Promise<ShopCustomerAddress> {
  const row = await ShopCustomerAddress.findOne({
    where: { id, ...scope(owner) },
    transaction: tx,
  })
  if (!row) throw new AppError(404, '地址不存在')
  return row
}

/** 清空该顾客全部默认标记（写事务内调用） */
async function clearDefaults(owner: AddressOwner, tx: Transaction): Promise<void> {
  await ShopCustomerAddress.update({ isDefault: 0 }, { where: { ...scope(owner), isDefault: 1 }, transaction: tx })
}

/** 把某条地址设为唯一默认（写事务内调用，调用前须先 clearDefaults） */
async function markDefault(owner: AddressOwner, id: number, tx: Transaction): Promise<void> {
  await ShopCustomerAddress.update({ isDefault: 1 }, { where: { id, ...scope(owner) }, transaction: tx })
}

/** 剩余地址中挑一条提升为默认（删除/取消默认后的兜底） */
async function promoteFallback(owner: AddressOwner, tx: Transaction, excludeId?: number): Promise<number | null> {
  const remaining = await ShopCustomerAddress.findAll({
    where: { ...scope(owner), ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}) },
    order: [['id', 'DESC']],
    limit: 1,
    transaction: tx,
  })
  const pick = remaining[0]
  if (!pick) return null
  await clearDefaults(owner, tx)
  await markDefault(owner, pick.id, tx)
  return pick.id
}

/** 当前顾客的地址列表（默认地址在前，其余按创建时间倒序） */
export async function listAddresses(owner: AddressOwner): Promise<AddressView[]> {
  const rows = await ShopCustomerAddress.findAll({
    where: scope(owner),
    order: [
      ['isDefault', 'DESC'],
      ['id', 'DESC'],
    ],
  })
  return rows.map(toView)
}

/** 新增地址；首条或 isDefault=true 的地址成为唯一默认 */
export async function createAddress(owner: AddressOwner, input: CreateAddressInput): Promise<AddressView> {
  return withOwnerLock(owner, async (tx) => {
    const count = await ShopCustomerAddress.count({ where: scope(owner), transaction: tx })
    const makeDefault = input.isDefault === true || count === 0
    if (makeDefault) await clearDefaults(owner, tx)

    const row = await ShopCustomerAddress.create(
      {
        tenantId: owner.tenantId,
        customerId: owner.customerId,
        fullName: input.fullName,
        phone: input.phone,
        country: input.country,
        province: input.province,
        city: input.city,
        address1: input.address1,
        address2: input.address2 ?? null,
        postcode: input.postcode,
        isDefault: makeDefault ? 1 : 0,
      } as never,
      { transaction: tx },
    )
    return toView(row)
  })
}

/** 编辑地址（非本人 → 404；归属字段不可改） */
export async function updateAddress(owner: AddressOwner, id: number, patch: UpdateAddressInput): Promise<AddressView> {
  return withOwnerLock(owner, async (tx) => {
    const row = await findOwned(owner, id, tx)

    // 只接受声明过的字段，归属字段（tenantId/customerId）永不进入更新集合
    const editable = ['fullName', 'phone', 'country', 'province', 'city', 'address1', 'address2', 'postcode'] as const
    const values: Record<string, unknown> = {}
    for (const key of editable) {
      if (patch[key] !== undefined) values[key] = patch[key]
    }
    if (patch.isDefault === true) {
      await clearDefaults(owner, tx)
      values.isDefault = 1
    } else if (patch.isDefault === false && Number(row.isDefault) === 1) {
      // 不允许出现「零个默认」：把另一条提升为默认，否则保持原默认
      const promoted = await promoteFallback(owner, tx, id)
      if (promoted !== null) values.isDefault = 0
    }
    if (Object.keys(values).length > 0) {
      await row.update(values as never, { transaction: tx })
    }
    return toView(row)
  })
}

/** 删除地址；删的是默认则自动提升剩余一条 */
export async function deleteAddress(owner: AddressOwner, id: number): Promise<{ id: number; promotedId: number | null }> {
  return withOwnerLock(owner, async (tx) => {
    const row = await findOwned(owner, id, tx)
    const wasDefault = Number(row.isDefault) === 1
    await row.destroy({ transaction: tx })
    const promotedId = wasDefault ? await promoteFallback(owner, tx) : null
    return { id, promotedId }
  })
}

/** 显式设为默认（非本人 → 404） */
export async function setDefaultAddress(owner: AddressOwner, id: number): Promise<AddressView> {
  return withOwnerLock(owner, async (tx) => {
    const row = await findOwned(owner, id, tx)
    await clearDefaults(owner, tx)
    await markDefault(owner, id, tx)
    row.isDefault = 1
    return toView(row)
  })
}
