import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 购物车明细（金额/标题/规格为加购时快照，仅展示用；报价由服务端重算） */
class ShopCartItem extends Model<InferAttributes<ShopCartItem>, InferCreationAttributes<ShopCartItem>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare cartId: number
  declare skuId: number
  declare spuId: number
  declare qty: CreationOptional<number>
  declare unitAmountCents: CreationOptional<number>
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
  {
    sequelize,
    tableName: 'cart_items',
    indexes: [{ unique: true, fields: ['tenantId', 'cartId', 'skuId'], name: 'uq_cart_items_cart_sku' }],
  },
)

export default ShopCartItem
