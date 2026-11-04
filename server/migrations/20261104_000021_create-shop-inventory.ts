import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('inventory', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: 'SKU ID' },
    warehouseId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '仓库 ID' },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '在库量' },
    locked: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '占用锁定量' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('inventory', ['tenantId', 'skuId'], { name: 'idx_inv_tenant_sku' })
  await queryInterface.addIndex('inventory', ['tenantId', 'warehouseId'], { name: 'idx_inv_tenant_wh' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('inventory')
}
