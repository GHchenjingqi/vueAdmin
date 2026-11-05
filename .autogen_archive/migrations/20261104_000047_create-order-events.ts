import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** P3-T13 / X-T03：订单状态变更审计（任一订单可回溯完整状态链） */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('order_events', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    orderNo: { type: DataTypes.STRING(64), allowNull: false },
    from: { type: DataTypes.STRING(32), allowNull: true, comment: '原状态' },
    to: { type: DataTypes.STRING(32), allowNull: false, comment: '新状态' },
    actor: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'system', comment: 'webhook/system/admin/customer' },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    eventId: { type: DataTypes.STRING(128), allowNull: true, comment: '触发事件 ID（幂等追溯）' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('order_events', ['tenantId', 'orderId'], { name: 'idx_order_events_order' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('order_events')
}
