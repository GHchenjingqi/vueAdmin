import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 支付会话/单据（金额与币种取订单快照；providerRef 幂等） */
class ShopOrderPayment extends Model<InferAttributes<ShopOrderPayment>, InferCreationAttributes<ShopOrderPayment>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare orderId: number
  declare orderNo: string
  declare provider: string
  declare providerRef: string
  declare sessionId: string
  /** 网关商户订单号（out_trade_no / invoice_id / orderId），真实通道才有 */
  declare gatewayOrderNo: string | null
  /** 网关侧交易号（PayPal order id / 微信 transaction_id / 支付宝 trade_no / 银联 queryId） */
  declare gatewayRef: string | null
  declare amountCents: number
  declare currency: string
  declare status: CreationOptional<string>
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
    provider: { type: DataTypes.STRING(20), allowNull: false, comment: 'mock/stripe/paypal…' },
    providerRef: { type: DataTypes.STRING(64), allowNull: false, comment: '服务商侧单号' },
    sessionId: { type: DataTypes.STRING(64), allowNull: false },
    gatewayOrderNo: { type: DataTypes.STRING(64), allowNull: true, comment: '网关商户订单号（纯字母数字）' },
    gatewayRef: { type: DataTypes.STRING(128), allowNull: true, comment: '网关侧交易号' },
    amountCents: { type: DataTypes.BIGINT, allowNull: false, comment: '支付金额(分)=订单快照' },
    currency: { type: DataTypes.STRING(3), allowNull: false, comment: '支付币种=订单快照币种' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'initiated', comment: 'initiated/authorized/captured/failed/refunding/refunded' },
    rawPayload: { type: DataTypes.JSON, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'order_payments',
    indexes: [
      { fields: ['tenantId', 'orderId'], name: 'idx_pay_order' },
      { unique: true, fields: ['provider', 'providerRef'], name: 'uq_pay_provider_ref' },
      { unique: true, fields: ['sessionId'], name: 'uq_pay_session' },
    ],
  },
)

export default ShopOrderPayment
