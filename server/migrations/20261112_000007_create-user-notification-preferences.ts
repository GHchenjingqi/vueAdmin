import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * P2-10 个人中心通知偏好表：仅存用户主动关闭的渠道（无记录=全部接收）。
 * 幂等：up 先探测表存在。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (tables.includes('user_notification_preferences')) return

  await queryInterface.createTable('user_notification_preferences', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '用户ID' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1, comment: '租户ID' },
    channelId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '通知渠道ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })

  await queryInterface.addIndex('user_notification_preferences', ['userId', 'channelId'], {
    name: 'uq_user_notify_pref_user_channel',
    unique: true,
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (tables.includes('user_notification_preferences')) await queryInterface.dropTable('user_notification_preferences')
}
