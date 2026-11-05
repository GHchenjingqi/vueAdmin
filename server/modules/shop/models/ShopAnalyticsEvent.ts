import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** CAPI 派发状态 */
export type DispatchStatus = 'local_only' | 'sent' | 'skipped_no_consent' | 'failed'

/** 服务端 CAPI 埋点事件（阶段 5 步骤 6） */
class ShopAnalyticsEvent extends Model<InferAttributes<ShopAnalyticsEvent>, InferCreationAttributes<ShopAnalyticsEvent>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare siteId: number | null
  declare eventId: string
  declare eventName: string
  declare consentAnalytics: CreationOptional<boolean>
  declare customerId: number | null
  declare sessionId: string | null
  declare orderId: number | null
  declare transactionId: string | null
  declare currency: string | null
  declare valueCents: CreationOptional<number>
  declare params: Record<string, unknown> | null
  declare dispatchStatus: CreationOptional<DispatchStatus>
  declare dispatchedAt: Date | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopAnalyticsEvent.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    siteId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '站点ID' },
    eventId: { type: DataTypes.STRING(64), allowNull: false, comment: '客户端事件ID（幂等去重）' },
    eventName: { type: DataTypes.STRING(40), allowNull: false, comment: '事件名' },
    consentAnalytics: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, comment: 'analytics 同意' },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '登录顾客ID' },
    sessionId: { type: DataTypes.STRING(64), allowNull: true, comment: '匿名会话ID' },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '关联订单ID' },
    transactionId: { type: DataTypes.STRING(64), allowNull: true, comment: '交易号' },
    currency: { type: DataTypes.STRING(3), allowNull: true, comment: '金额币种' },
    valueCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '事件金额(分)' },
    params: { type: DataTypes.JSON, allowNull: true, comment: '完整事件参数' },
    dispatchStatus: {
      type: DataTypes.STRING(24), allowNull: false, defaultValue: 'local_only',
      comment: 'local_only/sent/skipped_no_consent/failed',
    },
    dispatchedAt: { type: DataTypes.DATE, allowNull: true, comment: '派发时间' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'shop_analytics_events', underscored: false },
)

export default ShopAnalyticsEvent
