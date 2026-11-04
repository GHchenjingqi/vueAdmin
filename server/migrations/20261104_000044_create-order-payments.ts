import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** P3-T11：支付会话/单据（金额与币种取订单快照；providerRef 幂等） */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('order_payments', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    orderNo: { type: DataTypes.STRING(64), allowNull: false },
    provider: { type: DataTypes.STRING(20), allowNull: false, comment: 'mock/stripe/paypal…' },
    providerRef: { type: DataTypes.STRING(64), allowNull: false, comment: '服务商侧单号' },
    sessionId: { type: DataTypes.STRING(64), allowNull: false },
    amountCents: { type: DataTypes.BIGINT, allowNull: false, comment: '支付金额(分)=订单快照' },
    currency: { type: DataTypes.STRING(3), allowNull: false, comment: '支付币种=订单快照币种' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'initiated', comment: 'initiated/authorized/captured/failed/refunding/refunded' },
    rawPayload: { type: DataTypes.JSON, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('order_payments', ['tenantId', 'orderId'], { name: 'idx_pay_order' })
  await queryInterface.addIndex('order_payments', ['provider', 'providerRef'], { unique: true, name: 'uq_pay_provider_ref' })
  await queryInterface.addIndex('order_payments', ['sessionId'], { unique: true, name: 'uq_pay_session' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('order_payments')
}
