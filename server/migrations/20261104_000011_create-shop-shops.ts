import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('shops', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    channelId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '所属渠道 ID' },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '店铺名称' },
    credentials: { type: DataTypes.JSON, allowNull: true, comment: '店铺凭证（加密存储，JSON）' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('shops', ['tenantId', 'channelId'], { name: 'idx_shops_tenant_channel' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('shops')
}
