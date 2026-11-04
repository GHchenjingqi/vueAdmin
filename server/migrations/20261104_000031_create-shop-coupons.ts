import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('coupons', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(50), allowNull: false, comment: '券码' },
    type: {
      type: DataTypes.ENUM('fixed', 'percent'),
      allowNull: false,
      comment: '优惠类型：fixed 固定金额 / percent 百分比',
    },
    value: { type: DataTypes.DECIMAL(12, 2), allowNull: false, comment: '优惠值' },
    minSpend: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, comment: '最低消费门槛' },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD', comment: '币种' },
    validFrom: { type: DataTypes.DATEONLY, allowNull: false, comment: '生效日期' },
    validTo: { type: DataTypes.DATEONLY, allowNull: false, comment: '失效日期' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('coupons', ['tenantId', 'code'], { name: 'idx_coupon_tenant_code', unique: true })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('coupons')
}
