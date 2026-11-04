import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 订单（履约最小闭环） */
export type OrderStatus = 'created' | 'paid' | 'fulfilled' | 'shipped' | 'done' | 'cancelled'

class ShopOrder extends Model<InferAttributes<ShopOrder>, InferCreationAttributes<ShopOrder>> {
  declare id: CreationOptional<number>
  declare orderNo: string
  declare channelId: number
  declare shopId: number
  declare buyer: Record<string, unknown>
  declare currency: string
  declare amount: number
  declare status: CreationOptional<OrderStatus>
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopOrder.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    orderNo: { type: DataTypes.STRING(64), allowNull: false, comment: '订单号' },
    channelId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '渠道 ID' },
    shopId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '店铺 ID' },
    buyer: { type: DataTypes.JSON, allowNull: false, comment: '买家信息（JSON）' },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD', comment: '结算币种' },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, comment: '订单金额' },
    status: {
      type: DataTypes.ENUM('created', 'paid', 'fulfilled', 'shipped', 'done', 'cancelled'),
      allowNull: false,
      defaultValue: 'created',
      comment: '订单状态',
    },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'orders', underscored: false },
)

export default ShopOrder
