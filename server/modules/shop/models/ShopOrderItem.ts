import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 订单明细 */
class ShopOrderItem extends Model<InferAttributes<ShopOrderItem>, InferCreationAttributes<ShopOrderItem>> {
  declare id: CreationOptional<number>
  declare orderId: number
  declare skuId: number
  declare qty: number
  declare price: number
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopOrderItem.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '订单 ID' },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: 'SKU ID' },
    qty: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '数量' },
    price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, comment: '单价' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'order_items', underscored: false },
)

export default ShopOrderItem
