import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 订单邮件 outbox（P3-T17）：正文与币种在入队时固化，重试不再读站点配置 */
export type OrderMailType = 'confirmed' | 'shipped' | 'refunded'
export type OrderMailStatus = 'pending' | 'sent' | 'failed' | 'dead'

class ShopOrderEmail extends Model<InferAttributes<ShopOrderEmail>, InferCreationAttributes<ShopOrderEmail>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare orderId: number
  declare orderNo: string
  declare type: OrderMailType
  declare dedupeKey: CreationOptional<string>
  declare toEmail: string
  declare subject: string
  declare bodyText: string
  declare currency: string
  declare amountCents: number
  declare status: CreationOptional<OrderMailStatus>
  declare attempts: CreationOptional<number>
  declare nextAttemptAt: Date | null
  declare lastError: string | null
  declare sentAt: Date | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopOrderEmail.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    orderNo: { type: DataTypes.STRING(64), allowNull: false },
    type: { type: DataTypes.ENUM('confirmed', 'shipped', 'refunded'), allowNull: false },
    dedupeKey: { type: DataTypes.STRING(128), allowNull: false, defaultValue: '' },
    toEmail: { type: DataTypes.STRING(255), allowNull: false },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    bodyText: { type: DataTypes.TEXT, allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    amountCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.ENUM('pending', 'sent', 'failed', 'dead'), allowNull: false, defaultValue: 'pending' },
    attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    nextAttemptAt: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.STRING(255), allowNull: true },
    sentAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'shop_order_email_outbox' },
)

export default ShopOrderEmail
