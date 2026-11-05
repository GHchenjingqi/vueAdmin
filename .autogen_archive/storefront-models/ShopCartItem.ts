import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 购物车行（同 cart+sku 唯一；title/spec 为加购时快照） */
class ShopCartItem extends Model<InferAttributes<ShopCartItem>, InferCreationAttributes<ShopCartItem>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare cartId: number
  declare skuId: number
  declare spuId: number
  declare qty: number
  declare unitAmountCents: number
  declare currency: string
  declare titleSnapshot: string | null
  declare specSnapshot: Record<string, string> | null
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopCartItem.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    cartId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    spuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    unitAmountCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    titleSnapshot: { type: DataTypes.STRING(255), allowNull: true },
    specSnapshot: { type: DataTypes.JSON, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'cart_items', underscored: false },
)

export default ShopCartItem
