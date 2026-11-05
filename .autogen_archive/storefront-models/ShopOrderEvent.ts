import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 订单状态审计（from→to + actor + eventId，X-T03） */
class ShopOrderEvent extends Model<InferAttributes<ShopOrderEvent>, InferCreationAttributes<ShopOrderEvent>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare orderId: number
  declare orderNo: string
  declare from: string | null
  declare to: string
  declare actor: string
  declare reason: string | null
  declare eventId: string | null
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopOrderEvent.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    orderNo: { type: DataTypes.STRING(64), allowNull: false },
    from: { type: DataTypes.STRING(32), allowNull: true },
    to: { type: DataTypes.STRING(32), allowNull: false },
    actor: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'system' },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    eventId: { type: DataTypes.STRING(128), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'order_events', underscored: false },
)

export default ShopOrderEvent
