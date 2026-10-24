import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('payments', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    invoiceId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '发票ID' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    provider: { type: DataTypes.STRING(50), allowNull: false, comment: '支付渠道 wechat/alipay/stripe' },
    providerOrderId: { type: DataTypes.STRING(100), allowNull: true, comment: '渠道订单号' },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, comment: '金额' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending', comment: 'pending/success/failed' },
    paidAt: { type: DataTypes.DATE, allowNull: true, comment: '支付时间' },
    raw: { type: DataTypes.JSON, allowNull: true, comment: '支付渠道原始回调' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('payments', ['tenantId'])
  await queryInterface.addIndex('payments', ['invoiceId'])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('payments')
}