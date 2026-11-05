import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** P3-T07 / T-07：优惠券核销与用量上限（过期/用尽/不适用/币种不符服务端拒绝） */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('coupons', 'usageLimit', {
    type: DataTypes.INTEGER, allowNull: true, comment: '总核销上限（空=不限）',
  })
  await queryInterface.addColumn('coupons', 'usedCount', {
    type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '已核销次数',
  })
  await queryInterface.addColumn('coupons', 'kind', {
    type: DataTypes.STRING(20), allowNull: false, defaultValue: 'percent', comment: 'percent=百分比 / fixed=固定金额(value=元)',
  })

  await queryInterface.createTable('coupon_redemptions', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    couponId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    code: { type: DataTypes.STRING(64), allowNull: false },
    orderNo: { type: DataTypes.STRING(64), allowNull: false },
    discountCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('coupon_redemptions', ['tenantId', 'orderNo'], { name: 'uq_redemption_order', unique: true })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('coupon_redemptions')
  await queryInterface.removeColumn('coupons', 'usageLimit')
  await queryInterface.removeColumn('coupons', 'usedCount')
  await queryInterface.removeColumn('coupons', 'kind')
}
