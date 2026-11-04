import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 商品在渠道上的发布记录 */
export type ChannelProductStatus = 'listed' | 'published'

class ShopChannelProduct extends Model<InferAttributes<ShopChannelProduct>, InferCreationAttributes<ShopChannelProduct>> {
  declare id: CreationOptional<number>
  declare channelId: number
  declare shopId: number
  declare spuId: number
  declare skuId: number | null
  declare externalId: string | null
  declare status: CreationOptional<ChannelProductStatus>
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopChannelProduct.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    channelId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '渠道 ID' },
    shopId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '店铺 ID' },
    spuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: 'SPU ID' },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: 'SKU ID（可按 SKU 维度发布，可空表示整 SPU）' },
    externalId: { type: DataTypes.STRING(200), allowNull: true, comment: '平台侧商品 ID' },
    status: {
      type: DataTypes.ENUM('listed', 'published'),
      allowNull: false,
      defaultValue: 'listed',
      comment: '渠道上架状态：listed 已上架 / published 已发布',
    },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'channel_products', underscored: false },
)

export default ShopChannelProduct
