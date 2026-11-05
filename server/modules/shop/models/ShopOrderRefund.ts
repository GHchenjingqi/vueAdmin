import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 订单退款流水（T-09）：金额整数分，币种恒等于订单快照 */
export type RefundStatus = 'pending' | 'succeeded' | 'failed'

class ShopOrderRefund extends Model<InferAttributes<ShopOrderRefund>, InferCreationAttributes<ShopOrderRefund>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare orderId: number
  declare orderNo: string
  declare refundNo: string
  declare amountCents: number
  declare currency: string
  declare reason: string | null
  declare status: CreationOptional<RefundStatus>
  declare providerRef: string | null
  declare idempotencyKey: string

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopOrderRefund.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    orderNo: { type: DataTypes.STRING(64), allowNull: false },
    refundNo: { type: DataTypes.STRING(64), allowNull: false },
    amountCents: { type: DataTypes.BIGINT, allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    status: { type: DataTypes.ENUM('pending', 'succeeded', 'failed'), allowNull: false, defaultValue: 'pending' },
    providerRef: { type: DataTypes.STRING(128), allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(64), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'shop_order_refunds' },
)

export default ShopOrderRefund
