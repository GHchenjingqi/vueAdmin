import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * P2-11 通知渠道扩展：notification_channels
 * 统一管理 email / sms / webhook 渠道配置；tenantId 隔离，config 为 JSON。
 * 幂等：up 先探测表存在，down 直接删表。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (tables.includes('notification_channels')) return

  await queryInterface.createTable('notification_channels', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1, comment: '租户ID' },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '渠道名称' },
    type: { type: DataTypes.ENUM('email', 'sms', 'webhook'), allowNull: false, comment: '渠道类型' },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, comment: '是否启用' },
    config: { type: DataTypes.JSON, allowNull: false, comment: '渠道配置（敏感字段脱敏返回）' },
    remark: { type: DataTypes.STRING(255), allowNull: true, comment: '备注' },
    lastTestedAt: { type: DataTypes.DATE, allowNull: true, comment: '最近测试时间' },
    lastTestResult: { type: DataTypes.STRING(255), allowNull: true, comment: '最近测试结果' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })

  await queryInterface.addIndex('notification_channels', ['tenantId', 'type'], {
    name: 'idx_notification_channels_tenant_type',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (tables.includes('notification_channels')) await queryInterface.dropTable('notification_channels')
}
