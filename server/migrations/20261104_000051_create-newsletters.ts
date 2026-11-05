import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** 阶段5 步骤5：邮件订阅（newsletter） —— 复用 shop 模型层，不建第二套后端 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('newsletters', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: false, comment: '订阅邮箱（租户内唯一）' },
    status: {
      type: DataTypes.ENUM('subscribed', 'unsubscribed', 'pending'),
      allowNull: false,
      defaultValue: 'subscribed',
      comment: '订阅状态',
    },
    source: { type: DataTypes.STRING(50), allowNull: true, comment: '订阅来源：footer/checkout/popup' },
    locale: { type: DataTypes.STRING(10), allowNull: true, comment: '偏好语言' },
    token: { type: DataTypes.STRING(64), allowNull: false, comment: '退订/确认令牌（不可枚举）' },
    subscribedAt: { type: DataTypes.DATE, allowNull: true },
    unsubscribedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('newsletters', ['tenantId', 'email'], {
    unique: true,
    name: 'uq_newsletters_tenant_email',
  })
  await queryInterface.addIndex('newsletters', ['token'], { unique: true, name: 'uq_newsletters_token' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('newsletters')
}
