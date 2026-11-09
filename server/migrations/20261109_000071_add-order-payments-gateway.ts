import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** 真实支付网关接入：order_payments 增加网关商户订单号与网关交易号 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (!tables.includes('order_payments')) return
  const columns = (await queryInterface.describeTable('order_payments')) as Record<string, unknown>
  if (!columns.gatewayOrderNo) {
    await queryInterface.addColumn('order_payments', 'gatewayOrderNo', {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: '网关商户订单号（纯字母数字）',
    })
  }
  if (!columns.gatewayRef) {
    await queryInterface.addColumn('order_payments', 'gatewayRef', {
      type: DataTypes.STRING(128),
      allowNull: true,
      comment: '网关侧交易号',
    })
  }
  const indexes = (await queryInterface.showIndex('order_payments')) as { name: string }[]
  if (!indexes.some((i) => i.name === 'uq_pay_provider_gateway_order')) {
    await queryInterface.addIndex('order_payments', ['provider', 'gatewayOrderNo'], {
      unique: true,
      name: 'uq_pay_provider_gateway_order',
    })
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (!tables.includes('order_payments')) return
  const indexes = (await queryInterface.showIndex('order_payments')) as { name: string }[]
  if (indexes.some((i) => i.name === 'uq_pay_provider_gateway_order')) {
    await queryInterface.removeIndex('order_payments', 'uq_pay_provider_gateway_order')
  }
  const columns = (await queryInterface.describeTable('order_payments')) as Record<string, unknown>
  if (columns.gatewayRef) await queryInterface.removeColumn('order_payments', 'gatewayRef')
  if (columns.gatewayOrderNo) await queryInterface.removeColumn('order_payments', 'gatewayOrderNo')
}
