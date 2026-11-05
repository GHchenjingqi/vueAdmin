import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** Webhook 事件（provider+eventId 唯一去重；重复投递幂等返回） */
class ShopWebhookEvent extends Model<InferAttributes<ShopWebhookEvent>, InferCreationAttributes<ShopWebhookEvent>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare provider: string
  declare eventId: string
  declare type: string
  declare payload: Record<string, unknown> | null
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopWebhookEvent.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    provider: { type: DataTypes.STRING(20), allowNull: false },
    eventId: { type: DataTypes.STRING(128), allowNull: false },
    type: { type: DataTypes.STRING(64), allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'webhook_events', underscored: false },
)

export default ShopWebhookEvent
