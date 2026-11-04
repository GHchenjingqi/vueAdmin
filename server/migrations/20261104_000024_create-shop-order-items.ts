import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('order_items', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '订单 ID' },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: 'SKU ID' },
    qty: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '数量' },
    price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, comment: '单价' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('order_items', ['tenantId', 'orderId'], { name: 'idx_oi_tenant_order' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('order_items')
}
