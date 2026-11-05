import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 文章状态 */
export type ArticleStatus = 'draft' | 'published'

/**
 * 商城内容文章（博客 / 内容页）
 *
 * 与 shop 模块共用同一套模型层（阶段 5 步骤 5 第三切片）。
 * 内容按 tenantId + siteId（storefront 站点 = shops.id）隔离。
 * 公开接口仅返回 status='published' 的文章；草稿/未发布不可见。
 */
class ShopArticle extends Model<InferAttributes<ShopArticle>, InferCreationAttributes<ShopArticle>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare siteId: number
  declare title: string
  declare slug: string
  declare summary: string | null
  declare content: string
  declare coverImage: string | null
  declare status: CreationOptional<ArticleStatus>
  declare authorName: string | null
  declare tags: string[] | null
  declare publishedAt: Date | null
  declare sortOrder: CreationOptional<number>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopArticle.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    siteId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '站点ID（shops.id）' },
    title: { type: DataTypes.STRING(255), allowNull: false, comment: '标题' },
    slug: { type: DataTypes.STRING(255), allowNull: false, comment: 'URL 别名（站点内唯一）' },
    summary: { type: DataTypes.STRING(500), allowNull: true, comment: '摘要' },
    content: { type: DataTypes.TEXT, allowNull: false, comment: '正文' },
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
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序权重' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'shop_articles',
    indexes: [
      { name: 'uniq_articles_tenant_site_slug', unique: true, fields: ['tenantId', 'siteId', 'slug'] },
    ],
  },
)

export default ShopArticle
