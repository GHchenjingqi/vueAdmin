import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 库存中心：SKU × 仓库 的可用量（available = quantity - locked） */
class ShopInventory extends Model<InferAttributes<ShopInventory>, InferCreationAttributes<ShopInventory>> {
  declare id: CreationOptional<number>
  declare skuId: number
  declare warehouseId: number
  declare quantity: number
  declare locked: number
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopInventory.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: 'SKU ID' },
    warehouseId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '仓库 ID' },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '在库量' },
    locked: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '占用锁定量' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'inventory', underscored: false },
)

export default ShopInventory
