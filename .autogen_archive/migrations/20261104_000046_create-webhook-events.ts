import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** P3-T12：Webhook 事件去重表（event_id 唯一 → 重复投递不重复改单，T-03） */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('webhook_events', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    provider: { type: DataTypes.STRING(20), allowNull: false },
    eventId: { type: DataTypes.STRING(128), allowNull: false },
    type: { type: DataTypes.STRING(64), allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('webhook_events', ['provider', 'eventId'], { unique: true, name: 'uq_webhook_provider_event' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('webhook_events')
}
