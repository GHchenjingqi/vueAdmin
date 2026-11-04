import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('channels', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '渠道名称' },
    type: {
      type: DataTypes.ENUM('amazon', 'shopify', 'tiktok', 'shopee', 'independent'),
      allowNull: false,
      comment: '渠道类型',
    },
    config: { type: DataTypes.JSON, allowNull: true, comment: '渠道配置（JSON）' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('channels', ['tenantId', 'type'], { name: 'idx_channels_tenant_type' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('channels')
}
