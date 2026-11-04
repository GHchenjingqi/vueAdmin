import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('order_shipments', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '订单 ID' },
    carrier: { type: DataTypes.STRING(100), allowNull: false, comment: '承运商' },
    trackingNo: { type: DataTypes.STRING(100), allowNull: true, comment: '运单号' },
    customsNo: { type: DataTypes.STRING(100), allowNull: true, comment: '报关单号' },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'created', comment: '物流状态' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('order_shipments', ['tenantId', 'orderId'], { name: 'idx_ship_tenant_order' })

  // 报关单号字段依赖 SKU 合规信息自动带出，索引便于按报关单调阅
  await queryInterface.addIndex('order_shipments', ['tenantId', 'customsNo'], { name: 'idx_ship_tenant_customs' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('order_shipments')
}
