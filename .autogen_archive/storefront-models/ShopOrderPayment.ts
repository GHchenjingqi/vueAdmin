import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 支付单（金额与币种取订单快照 C6；provider+providerRef 幂等） */
class ShopOrderPayment extends Model<InferAttributes<ShopOrderPayment>, InferCreationAttributes<ShopOrderPayment>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare orderId: number
  declare orderNo: string
  declare provider: string
  declare providerRef: string
  declare sessionId: string
  declare amountCents: number
  declare currency: string
  declare status: CreationOptional<'initiated' | 'authorized' | 'captured' | 'failed' | 'refunding' | 'refunded'>
  declare rawPayload: Record<string, unknown> | null
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopOrderPayment.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    orderNo: { type: DataTypes.STRING(64), allowNull: false },
    provider: { type: DataTypes.STRING(20), allowNull: false },
    providerRef: { type: DataTypes.STRING(64), allowNull: false },
    sessionId: { type: DataTypes.STRING(64), allowNull: false },
    amountCents: { type: DataTypes.BIGINT, allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'initiated' },
    rawPayload: { type: DataTypes.JSON, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'order_payments', underscored: false },
)

export default ShopOrderPayment
