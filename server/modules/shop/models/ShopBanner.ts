import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** Banner 展示位置 */
export type BannerPosition = 'hero' | 'secondary'

/**
 * 商城首页 Banner（营销首屏）
 *
 * 按 tenantId + siteId（storefront 站点 = shops.id）隔离，对齐 shop_articles。
 * 前台仅返回 enabled=true 且当前时间在 startAt/endAt 区间内的 banner。
 */
class ShopBanner extends Model<InferAttributes<ShopBanner>, InferCreationAttributes<ShopBanner>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare siteId: number
  declare position: CreationOptional<BannerPosition>
  declare title: string
  declare subtitle: string | null
  declare linkUrl: string | null
  declare buttonLabel: string | null
  declare image: string
  declare enabled: CreationOptional<boolean>
  declare sortOrder: CreationOptional<number>
  declare startAt: Date | null
  declare endAt: Date | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopBanner.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    siteId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '站点ID（shops.id）' },
    position: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'hero',
      comment: 'hero/secondary',
    },
    title: { type: DataTypes.STRING(255), allowNull: false, comment: '主标题' },
    subtitle: { type: DataTypes.STRING(500), allowNull: true, comment: '副标题' },
    linkUrl: { type: DataTypes.STRING(512), allowNull: true, comment: '跳转链接' },
    buttonLabel: { type: DataTypes.STRING(120), allowNull: true, comment: '按钮文案' },
    image: { type: DataTypes.STRING(512), allowNull: false, comment: '图片 URL' },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: '是否启用',
    },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序权重（大在前）' },
    startAt: { type: DataTypes.DATE, allowNull: true, comment: '展示开始时间（空=立即）' },
    endAt: { type: DataTypes.DATE, allowNull: true, comment: '展示结束时间（空=永久）' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'shop_banners',
    indexes: [
      { name: 'idx_banners_tenant_site_position_enabled_sort', fields: ['tenantId', 'siteId', 'position', 'enabled', 'sortOrder'] },
    ],
  },
)

export default ShopBanner
