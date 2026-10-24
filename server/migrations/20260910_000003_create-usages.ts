import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('usages', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    metric: { type: DataTypes.STRING(50), allowNull: false, comment: '指标 users/storage/apiCalls/workflowRuns/files' },
    period: { type: DataTypes.STRING(8), allowNull: false, comment: 'YYYYMMDD 或 YYYYMM' },
    value: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '累计值' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('usages', ['tenantId'])
  await queryInterface.addIndex('usages', ['tenantId', 'metric', 'period'], { unique: true })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('usages')
}