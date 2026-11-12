import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 标准化商品（SPU，多语言标题/详情） */
export type SpuStatus = 'draft' | 'review' | 'rejected' | 'listed' | 'published' | 'unlisted' | 'archived'

class ShopSpu extends Model<InferAttributes<ShopSpu>, InferCreationAttributes<ShopSpu>> {
  declare id: CreationOptional<number>
  declare categoryId: number
  declare brandId: number | null
  declare name: Record<string, string>
  declare description: Record<string, string> | null
  declare cover: string | null
  declare images: string[] | null
  declare videos: string[] | null
  declare slug: string | null
  declare status: CreationOptional<SpuStatus>
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopSpu.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    categoryId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '类目 ID',
    },
    brandId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '品牌 ID',
    },
    name: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: '商品标题（多语言 JSON）',
    },
    description: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '商品详情（多语言 JSON）',
    },
    cover: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '主图 URL',
    },
    images: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '图集 URL 列表',
    },
    videos: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '视频 URL 列表（本地 /uploads/ 或 CDN）',
    },
    slug: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: 'SEO slug（后台可编辑，留空则由前台生成式 slug 兜底）',
    },
    status: {
      type: DataTypes.ENUM('draft', 'review', 'rejected', 'listed', 'published', 'unlisted', 'archived'),
      allowNull: false,
      defaultValue: 'draft',
      comment: '上架/发布状态机',
    },
    tenantId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '租户ID',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'spus', underscored: false },
)

export default ShopSpu
