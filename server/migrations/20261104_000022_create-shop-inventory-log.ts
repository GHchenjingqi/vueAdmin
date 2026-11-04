import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('inventory_log', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: 'SKU ID' },
    warehouseId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '仓库 ID' },
    delta: { type: DataTypes.INTEGER, allowNull: false, comment: '变动量' },
    type: {
      type: DataTypes.ENUM('in', 'out', 'lock', 'unlock'),
      allowNull: false,
      comment: '流水类型：in 入库 / out 出库 / lock 占用 / unlock 释放',
    },
    ref: { type: DataTypes.STRING(200), allowNull: true, comment: '关联单号' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('inventory_log', ['tenantId', 'skuId'], { name: 'idx_il_tenant_sku' })
  await queryInterface.addIndex('inventory_log', ['tenantId', 'createdAt'], { name: 'idx_il_tenant_created' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('inventory_log')
}
