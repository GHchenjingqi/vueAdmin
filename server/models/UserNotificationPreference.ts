import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

/**
 * 用户通知偏好（P2-10）：只存「被关闭的渠道」，无记录视为全部接收。
 * 与 notification_channels 的启用态取交集，渠道被管理员停用后偏好自动失效。
 */
class UserNotificationPreference extends Model<
  InferAttributes<UserNotificationPreference>,
  InferCreationAttributes<UserNotificationPreference>
> {
  declare id: CreationOptional<number>
  declare userId: number
  declare tenantId: CreationOptional<number>
  declare channelId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

UserNotificationPreference.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '用户ID' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1, comment: '租户ID' },
    channelId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '通知渠道ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'user_notification_preferences',
    modelName: 'UserNotificationPreference',
    timestamps: true,
    comment: '用户通知偏好（被关闭的渠道）',
  },
)

export default UserNotificationPreference
