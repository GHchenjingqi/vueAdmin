import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 单条轨迹节点 */
export interface TrackingNode {
  time: string
  description: string
  location?: string
  status?: string
}

/** 物流轨迹缓存（阶段 5 步骤 5 / 第五切片） */
class ShopTrackingEvent extends Model<InferAttributes<ShopTrackingEvent>, InferCreationAttributes<ShopTrackingEvent>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare siteId: number | null
  declare orderId: number
  declare shipmentId: number
  declare carrier: string | null
  declare trackingNo: string | null
  declare status: CreationOptional<string>
  declare events: TrackingNode[] | null
  declare provider: CreationOptional<string>
  declare syncedAt: Date

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopTrackingEvent.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    siteId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '站点ID（shops.id）' },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '订单ID' },
    shipmentId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '物流单ID' },
    carrier: { type: DataTypes.STRING(100), allowNull: true, comment: '承运商' },
    trackingNo: { type: DataTypes.STRING(100), allowNull: true, comment: '运单号' },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'created',
      comment: 'created/in_transit/delivered/exception',
    },
    events: { type: DataTypes.JSON, allowNull: true, comment: '轨迹事件数组' },
    provider: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'local', comment: '轨迹来源 provider' },
    syncedAt: { type: DataTypes.DATE, allowNull: false, comment: '最近同步时间' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'shop_tracking_events', underscored: false },
)

export default ShopTrackingEvent
