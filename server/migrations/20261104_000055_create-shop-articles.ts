import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 阶段 5 步骤 5（第三切片）：内容管理 shop_articles（博客 / 内容页）
 * 与 shop 模块共用同一套模型层，不建第二套后端。
 * 内容按 tenantId + siteId（storesfront 站点 = shops.id）隔离。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('shop_articles', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    siteId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '站点ID（shops.id），多站点隔离' },
    title: { type: DataTypes.STRING(255), allowNull: false, comment: '标题' },
    slug: { type: DataTypes.STRING(255), allowNull: false, comment: 'URL 别名（站点内唯一）' },
    summary: { type: DataTypes.STRING(500), allowNull: true, comment: '摘要' },
    content: { type: DataTypes.TEXT, allowNull: false, comment: '正文（富文本/Markdown）' },
    coverImage: { type: DataTypes.STRING(512), allowNull: true, comment: '封面图 URL' },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'draft',
      comment: 'draft/published',
    },
    authorName: { type: DataTypes.STRING(120), allowNull: true, comment: '作者名' },
    tags: { type: DataTypes.JSON, allowNull: true, comment: '标签数组' },
    publishedAt: { type: DataTypes.DATE, allowNull: true, comment: '发布时间' },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序权重（大在前）' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('shop_articles', ['tenantId', 'siteId', 'slug'], {
    name: 'uniq_articles_tenant_site_slug',
    unique: true,
  })
  await queryInterface.addIndex('shop_articles', ['tenantId', 'siteId', 'status', 'publishedAt'], {
    name: 'idx_articles_tenant_site_status_published',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('shop_articles')
}
