import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** C 端购物车（游客 token / 顾客归属；行金额仅为展示快照，报价以 Quote 为准） */
class ShopCart extends Model<InferAttributes<ShopCart>, InferCreationAttributes<ShopCart>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare token: string
  declare customerId: number | null
  declare currency: string
  declare version: number
  declare expiresAt: Date | null
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopCart.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    token: { type: DataTypes.STRING(64), allowNull: false },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'carts', underscored: false },
)

export default ShopCart
