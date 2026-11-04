import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('warehouses', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '仓库名称' },
    type: {
      type: DataTypes.ENUM('bonded', 'overseas', 'direct'),
      allowNull: false,
      comment: '仓库类型：bonded 保税仓 / overseas 海外仓 / direct 直邮',
    },
    country: { type: DataTypes.STRING(2), allowNull: false, defaultValue: 'CN', comment: '所在国家（ISO2）' },
    address: { type: DataTypes.STRING(500), allowNull: true, comment: '仓库地址' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('warehouses', ['tenantId', 'type'], { name: 'idx_wh_tenant_type' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('warehouses')
}
