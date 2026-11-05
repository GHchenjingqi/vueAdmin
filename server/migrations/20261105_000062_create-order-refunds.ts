import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * T-09 退款状态流：订单退款流水表。
 *
 * - 金额一律整数「分」（BIGINT），币种强制取订单快照，不接受调用方指定；
 * - (tenantId, idempotencyKey) 唯一保证重复请求不二次退款；
 * - pending 也计入已退额度，避免并发请求超退。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('shop_order_refunds', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    orderNo: { type: DataTypes.STRING(64), allowNull: false },
    refundNo: { type: DataTypes.STRING(64), allowNull: false },
    amountCents: { type: DataTypes.BIGINT, allowNull: false, comment: '退款金额（整数分）' },
    currency: { type: DataTypes.STRING(3), allowNull: false, comment: '恒等于订单快照币种' },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'succeeded', 'failed'), allowNull: false, defaultValue: 'pending' },
    providerRef: { type: DataTypes.STRING(128), allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(64), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('shop_order_refunds', ['tenantId', 'idempotencyKey'], {
    name: 'uk_order_refund_idem',
    unique: true,
  })
  await queryInterface.addIndex('shop_order_refunds', ['tenantId', 'refundNo'], {
    name: 'uk_order_refund_no',
    unique: true,
  })
  await queryInterface.addIndex('shop_order_refunds', ['tenantId', 'orderId'], {
    name: 'idx_order_refund_order',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('shop_order_refunds')
}
