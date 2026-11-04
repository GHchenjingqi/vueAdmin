import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 销售渠道（Amazon / Shopify / TikTok / Shopee / 独立站） */
export type ChannelType = 'amazon' | 'shopify' | 'tiktok' | 'shopee' | 'independent'

class ShopChannel extends Model<InferAttributes<ShopChannel>, InferCreationAttributes<ShopChannel>> {
  declare id: CreationOptional<number>
  declare name: string
  declare type: ChannelType
  declare config: Record<string, unknown> | null
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopChannel.init(
  {
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
  },
  { sequelize, tableName: 'channels', underscored: false },
)

export default ShopChannel
