import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('orders', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    orderNo: { type: DataTypes.STRING(64), allowNull: false, comment: '订单号' },
    channelId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '渠道 ID' },
    shopId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '店铺 ID' },
    buyer: { type: DataTypes.JSON, allowNull: false, comment: '买家信息（JSON）' },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD', comment: '结算币种' },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, comment: '订单金额' },
    status: {
      type: DataTypes.ENUM('created', 'paid', 'fulfilled', 'shipped', 'done', 'cancelled'),
      allowNull: false,
      defaultValue: 'created',
      comment: '订单状态',
    },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('orders', ['tenantId', 'status'], { name: 'idx_orders_tenant_status' })
  await queryInterface.addIndex('orders', ['tenantId', 'channelId'], { name: 'idx_orders_tenant_channel' })
  await queryInterface.addIndex('orders', ['orderNo'], { name: 'idx_orders_orderno', unique: true })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('orders')
}
