import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 首页 Banner CMS（独立站营销首屏）：
 * shop_banners 按 tenantId + siteId（shops.id）隔离，对齐 shop_articles。
 * position 区分位置（hero / secondary），enabled + startAt/endAt 控制展示时段，
 * sortOrder 排序（大在前）。存在性探测幂等。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (!tables.includes('shop_banners')) {
    await queryInterface.createTable('shop_banners', {
      id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
      tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
      siteId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '站点ID（shops.id），多站点隔离' },
      position: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'hero',
        comment: '展示位置 hero/secondary',
      },
      title: { type: DataTypes.STRING(255), allowNull: false, comment: '主标题' },
      subtitle: { type: DataTypes.STRING(500), allowNull: true, comment: '副标题' },
      linkUrl: { type: DataTypes.STRING(512), allowNull: true, comment: '点击跳转链接' },
      buttonLabel: { type: DataTypes.STRING(120), allowNull: true, comment: '按钮文案（空则不显示按钮）' },
      image: { type: DataTypes.STRING(512), allowNull: false, comment: '图片 URL' },
      enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, comment: '是否启用' },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序权重（大在前）' },
      startAt: { type: DataTypes.DATE, allowNull: true, comment: '展示开始时间（空=立即）' },
      endAt: { type: DataTypes.DATE, allowNull: true, comment: '展示结束时间（空=永久）' },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    })
    await queryInterface.addIndex('shop_banners', ['tenantId', 'siteId', 'position', 'enabled', 'sortOrder'], {
      name: 'idx_banners_tenant_site_position_enabled_sort',
    })
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (tables.includes('shop_banners')) {
    await queryInterface.dropTable('shop_banners')
  }
}
