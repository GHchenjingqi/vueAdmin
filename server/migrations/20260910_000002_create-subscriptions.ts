import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('subscriptions', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    planId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '套餐ID' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active', comment: 'trial/active/overdue/cancelled' },
    currentPeriodStart: { type: DataTypes.DATE, allowNull: false, comment: '当前周期开始' },
    currentPeriodEnd: { type: DataTypes.DATE, allowNull: false, comment: '当前周期结束' },
    trialEndAt: { type: DataTypes.DATE, allowNull: true, comment: '试用到期时间' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('subscriptions', ['tenantId'])
  await queryInterface.addIndex('subscriptions', ['tenantId', 'status'])

  // 默认租户 id=1 绑定 pro 套餐
  await queryInterface.sequelize.query(
    "INSERT INTO subscriptions (tenantId, planId, status, currentPeriodStart, currentPeriodEnd, createdAt, updatedAt) SELECT 1, id, 'active', NOW(), DATE_ADD(NOW(), INTERVAL 1 MONTH), NOW(), NOW() FROM plans WHERE code='pro'",
  )
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('subscriptions')
}