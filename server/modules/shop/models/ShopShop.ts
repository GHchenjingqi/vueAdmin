import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 渠道下的店铺（如 Amazon 美国站、自营独立站） */
class ShopShop extends Model<InferAttributes<ShopShop>, InferCreationAttributes<ShopShop>> {
  declare id: CreationOptional<number>
  declare channelId: number
  declare name: string
  declare credentials: Record<string, unknown> | null
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopShop.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    channelId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '所属渠道 ID' },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '店铺名称' },
    credentials: { type: DataTypes.JSON, allowNull: true, comment: '店铺凭证（加密存储，JSON）' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'shops', underscored: false },
)

export default ShopShop
