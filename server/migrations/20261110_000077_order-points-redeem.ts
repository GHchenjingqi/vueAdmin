import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 积分抵扣下单：orders 加列 pointsUsed（消耗积分数）/ pointsDiscountCents（抵扣金额，分）。
 * 抵扣在报价时计算、建单时校验余额、支付 captured 时扣减积分并写支出流水（幂等 uq tenant+order+reason）。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (!tables.includes('orders')) return
  const cols = (await queryInterface.describeTable('orders')) as Record<string, unknown>
  if (!cols.pointsUsed) {
    await queryInterface.addColumn('orders', 'pointsUsed', {
      type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '本单消耗积分数',
    })
  }
  if (!cols.pointsDiscountCents) {
    await queryInterface.addColumn('orders', 'pointsDiscountCents', {
      type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '积分抵扣金额（分）',
    })
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (!tables.includes('orders')) return
  const cols = (await queryInterface.describeTable('orders')) as Record<string, unknown>
  if (cols.pointsDiscountCents) await queryInterface.removeColumn('orders', 'pointsDiscountCents')
  if (cols.pointsUsed) await queryInterface.removeColumn('orders', 'pointsUsed')
}
