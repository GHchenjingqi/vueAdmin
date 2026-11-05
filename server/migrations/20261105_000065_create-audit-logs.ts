import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * X-T03 审计日志：订单/支付/库存/退款状态变更全留痕
 *
 * 与 shop 模块共用模型层，不建第二套后端。
 * - 币种配置变更审计已在 `config_changes` 表（P5-T02），本表覆盖交易主链路四类实体；
 * - actorType 区分 操作来源（admin / customer / system），system 事件（Webhook、库存预占）actorId 为 null；
 * - beforeState / afterState 为可选 JSON 快照，用于回溯状态变更链。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('audit_logs', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    actorType: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'system', comment: 'admin|customer|system' },
    actorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '操作人ID；system 事件为 null' },
    action: { type: DataTypes.STRING(80), allowNull: false, comment: '动作，如 order.payment_captured' },
    entityType: { type: DataTypes.STRING(40), allowNull: false, comment: 'order|payment|inventory|refund|config' },
    entityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '关联实体ID' },
    beforeState: { type: DataTypes.JSON, allowNull: true },
    afterState: { type: DataTypes.JSON, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('audit_logs', ['tenantId', 'entityType', 'entityId'], { name: 'idx_audit_entity' })
  await queryInterface.addIndex('audit_logs', ['tenantId', 'createdAt'], { name: 'idx_audit_created' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('audit_logs')
}
