import type { QueryInterface } from 'sequelize'

/**
 * 券删除事务行锁的前置索引。
 *
 * marketingService.deleteCoupon 在事务内对
 * `SELECT ... FROM coupon_redemptions WHERE tenantId=? AND couponId=? FOR UPDATE`
 * 加间隙锁，阻止并发 redeemCoupon 插入同券流水，消除「查完再删」的窄窗口。
 * 若无 (tenantId, couponId) 索引，MySQL 会把间隙锁扩大到整表，
 * 阻塞所有券的并发核销，因此本迁移必须先于该删除逻辑应用。
 */
const TABLE = 'coupon_redemptions'
const INDEX = 'idx_cr_tenant_coupon'

export async function up(queryInterface: QueryInterface): Promise<void> {
  const indexes = (await queryInterface.showIndex(TABLE)) as Array<{ name?: string; Key_name?: string }>
  if (indexes.some((i) => (i.name ?? i.Key_name) === INDEX)) return
  await queryInterface.addIndex(TABLE, { fields: ['tenantId', 'couponId'], name: INDEX })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const indexes = (await queryInterface.showIndex(TABLE)) as Array<{ name?: string; Key_name?: string }>
  if (!indexes.some((i) => (i.name ?? i.Key_name) === INDEX)) return
  await queryInterface.removeIndex(TABLE, INDEX)
}
