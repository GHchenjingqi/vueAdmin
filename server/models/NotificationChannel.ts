import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

export type ChannelType = 'email' | 'sms' | 'webhook'

/** 渠道配置：按 type 使用不同字段；敏感字段在出参统一脱敏 */
export interface ChannelConfig {
  // webhook
  url?: string
  secret?: string
  // email
  host?: string
  port?: number
  secure?: boolean
  user?: string
  pass?: string
  from?: string
  // sms
  provider?: string
  apiKey?: string
  signName?: string
  [key: string]: unknown
}

/**
 * 通知渠道配置（P2-11 通知渠道扩展）
 * 统一管理 email / sms / webhook 三类渠道，供系统通知、订单通知与个人中心偏好设置复用。
 */
class NotificationChannel extends Model<InferAttributes<NotificationChannel>, InferCreationAttributes<NotificationChannel>> {
  declare id: CreationOptional<number>
  declare tenantId: CreationOptional<number>
  declare name: string
  declare type: ChannelType
  declare enabled: CreationOptional<boolean>
  declare config: CreationOptional<ChannelConfig>
  declare remark: CreationOptional<string | null>
  declare lastTestedAt: CreationOptional<Date | null>
  declare lastTestResult: CreationOptional<string | null>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

NotificationChannel.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1, comment: '租户ID' },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '渠道名称' },
    type: { type: DataTypes.ENUM('email', 'sms', 'webhook'), allowNull: false, comment: '渠道类型' },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, comment: '是否启用' },
    config: { type: DataTypes.JSON, allowNull: false, defaultValue: {}, comment: '渠道配置（敏感字段脱敏返回）' },
    remark: { type: DataTypes.STRING(255), allowNull: true, comment: '备注' },
    lastTestedAt: { type: DataTypes.DATE, allowNull: true, comment: '最近测试时间' },
    lastTestResult: { type: DataTypes.STRING(255), allowNull: true, comment: '最近测试结果' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'notification_channels',
    modelName: 'NotificationChannel',
    timestamps: true,
    comment: '通知渠道配置',
  },
)

export default NotificationChannel
