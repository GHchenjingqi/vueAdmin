import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('rate_snapshots', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    baseCurrency: {
      type: DataTypes.CHAR(3),
      allowNull: false,
      defaultValue: 'USD',
      comment: '基准币种',
    },
    rates: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: '汇率 JSON（如 {"CNY":7.24,"EUR":0.92}，1 基准币兑 N 目标币）',
    },
    rateDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: '快照日期',
    },
    tenantId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '租户ID',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  await queryInterface.addIndex('rate_snapshots', ['tenantId', 'baseCurrency', 'rateDate'], {
    unique: true,
    name: 'uq_rate_snapshots_tenant_base_date',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('rate_snapshots')
}
