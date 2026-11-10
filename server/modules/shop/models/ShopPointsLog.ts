import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 积分流水（change 正=发放 负=扣减；uq(tenant,order,reason) 保证订单积分幂等） */
class ShopPointsLog extends Model<InferAttributes<ShopPointsLog>, InferCreationAttributes<ShopPointsLog>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare customerId: number
  declare change: number
  declare balanceAfter: number
  declare reason: string
  declare orderId: number | null
  declare operatorType: CreationOptional<string>
  declare operatorId: number | null
  declare note: string | null
  declare expiresAt: Date | null
  declare remaining: number | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopPointsLog.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '顾客ID' },
    change: { type: DataTypes.INTEGER, allowNull: false, comment: '积分变动（正=发放 负=扣减）' },
    balanceAfter: { type: DataTypes.INTEGER, allowNull: false, comment: '变动后余额' },
    reason: { type: DataTypes.STRING(64), allowNull: false, comment: 'order_captured/manual/adjust' },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '关联订单（可空）' },
    operatorType: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'system', comment: 'system/admin' },
    operatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '管理员ID（manual 时）' },
    note: { type: DataTypes.STRING(255), allowNull: true, comment: '备注' },
    expiresAt: { type: DataTypes.DATE, allowNull: true, comment: '批次过期时间（发分批次写入；NULL=永不过期）' },
    remaining: { type: DataTypes.INTEGER, allowNull: true, comment: '批次剩余量（发分批次记账；负流水为 NULL）' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'points_logs',
    indexes: [
      { fields: ['tenantId', 'customerId', 'createdAt'], name: 'idx_points_tenant_customer_time' },
      { unique: true, fields: ['tenantId', 'orderId', 'reason'], name: 'uq_points_tenant_order_reason' },
      { fields: ['tenantId', 'customerId', 'expiresAt'], name: 'idx_points_expiry_scan' },
    ],
  },
)

export default ShopPointsLog
