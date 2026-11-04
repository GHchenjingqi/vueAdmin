import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * P3-T09/T10：C 端订单结算扩展列（快照 + 幂等 + 访问凭证 + 币种快照）
 * 金额列一律整数「分」（BIGINT），存量 amount DECIMAL 保留仅作后台展示。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('orders', 'paymentStatus', {
    type: DataTypes.STRING(20), allowNull: false, defaultValue: 'none', comment: '支付状态: none/initiated/authorized/captured/failed/refunding/refunded',
  })
  await queryInterface.addColumn('orders', 'email', { type: DataTypes.STRING(255), allowNull: true, comment: '下单邮箱' })
  await queryInterface.addColumn('orders', 'shippingAddress', { type: DataTypes.JSON, allowNull: true, comment: '收货地址快照' })
  await queryInterface.addColumn('orders', 'note', { type: DataTypes.STRING(500), allowNull: true })
  await queryInterface.addColumn('orders', 'subtotalCents', { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '商品小计(分)' })
  await queryInterface.addColumn('orders', 'discountCents', { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '优惠(分)' })
  await queryInterface.addColumn('orders', 'shippingCents', { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '运费(分)' })
  await queryInterface.addColumn('orders', 'taxCents', { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '税费(分)' })
  await queryInterface.addColumn('orders', 'amountCents', { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '应付总额(分)' })
  await queryInterface.addColumn('orders', 'couponCode', { type: DataTypes.STRING(64), allowNull: true })
  await queryInterface.addColumn('orders', 'accessToken', { type: DataTypes.STRING(64), allowNull: true, comment: '订单访问凭证（防枚举）' })
  await queryInterface.addColumn('orders', 'idempotencyKey', { type: DataTypes.STRING(64), allowNull: true, comment: '创建幂等键' })
  await queryInterface.addColumn('orders', 'reservationId', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '库存预占ID' })
  await queryInterface.addColumn('orders', 'policySnapshot', { type: DataTypes.JSON, allowNull: true, comment: '下单时政策快照' })
  await queryInterface.addColumn('orders', 'paidAt', { type: DataTypes.DATE, allowNull: true })
  await queryInterface.addColumn('orders', 'closedAt', { type: DataTypes.DATE, allowNull: true })
  await queryInterface.addColumn('orders', 'cancelledReason', { type: DataTypes.STRING(255), allowNull: true })
  await queryInterface.addIndex('orders', ['idempotencyKey'], { unique: true, name: 'uq_orders_idempotency_key' })
  await queryInterface.addIndex('orders', ['accessToken'], { name: 'idx_orders_access_token' })

  await queryInterface.addColumn('order_items', 'title', { type: DataTypes.STRING(255), allowNull: true, comment: '商品标题快照' })
  await queryInterface.addColumn('order_items', 'spec', { type: DataTypes.JSON, allowNull: true, comment: '规格快照' })
  await queryInterface.addColumn('order_items', 'unitAmountCents', { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '单价(分)' })
  await queryInterface.addColumn('order_items', 'lineTotalCents', { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '行小计(分)' })
  await queryInterface.addColumn('order_items', 'currency', { type: DataTypes.STRING(3), allowNull: true, comment: '行币种快照' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('order_items', 'title')
  await queryInterface.removeColumn('order_items', 'spec')
  await queryInterface.removeColumn('order_items', 'unitAmountCents')
  await queryInterface.removeColumn('order_items', 'lineTotalCents')
  await queryInterface.removeColumn('order_items', 'currency')
  await queryInterface.removeIndex('orders', 'uq_orders_idempotency_key')
  await queryInterface.removeIndex('orders', 'idx_orders_access_token')
  for (const col of ['paymentStatus', 'email', 'shippingAddress', 'note', 'subtotalCents', 'discountCents', 'shippingCents', 'taxCents', 'amountCents', 'couponCode', 'accessToken', 'idempotencyKey', 'reservationId', 'policySnapshot', 'paidAt', 'closedAt', 'cancelledReason']) {
    await queryInterface.removeColumn('orders', col)
  }
}
