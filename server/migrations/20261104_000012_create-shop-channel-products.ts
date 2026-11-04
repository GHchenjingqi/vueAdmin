import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('channel_products', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    channelId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '渠道 ID' },
    shopId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '店铺 ID' },
    spuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: 'SPU ID' },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: 'SKU ID（可按 SKU 维度发布）' },
    externalId: { type: DataTypes.STRING(200), allowNull: true, comment: '平台侧商品 ID' },
    status: {
      type: DataTypes.ENUM('listed', 'published'),
      allowNull: false,
      defaultValue: 'listed',
      comment: '渠道上架状态',
    },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('channel_products', ['tenantId', 'channelId'], { name: 'idx_cp_tenant_channel' })
  await queryInterface.addIndex('channel_products', ['tenantId', 'spuId'], { name: 'idx_cp_tenant_spu' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('channel_products')
}
