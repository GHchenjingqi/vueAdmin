import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * P5-T04：仓库路由规则与按仓配送承诺。
 *
 * - priority：路由优先级（升序优先，默认 100）；同优先级按可用量降序。
 * - deliveryEstimateDays：该仓库发货的配送承诺（天），用于「配送承诺按仓计算」。
 * - servedCountries：可选区域白名单（ISO2 数组）；空/未配置 = 服务全部目的国。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('warehouses', 'priority', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 100,
    comment: '仓库路由优先级（升序优先）',
  })
  await queryInterface.addColumn('warehouses', 'deliveryEstimateDays', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5,
    comment: '该仓库发货的配送承诺（天）',
  })
  await queryInterface.addColumn('warehouses', 'servedCountries', {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '可选区域白名单（ISO2 数组）；空/未配置=服务全部',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('warehouses', 'servedCountries')
  await queryInterface.removeColumn('warehouses', 'deliveryEstimateDays')
  await queryInterface.removeColumn('warehouses', 'priority')
}
