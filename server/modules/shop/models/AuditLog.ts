import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 审计日志（X-T03：订单/支付/库存/退款状态变更留痕） */
class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare actorType: 'admin' | 'customer' | 'system'
  declare actorId: number | null
  declare action: string
  declare entityType: 'order' | 'payment' | 'inventory' | 'refund' | 'config'
  declare entityId: number | null
  declare beforeState: unknown
  declare afterState: unknown
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

AuditLog.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    actorType: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'system' },
    actorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    action: { type: DataTypes.STRING(80), allowNull: false },
    entityType: { type: DataTypes.STRING(40), allowNull: false },
    entityId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    beforeState: { type: DataTypes.JSON, allowNull: true },
    afterState: { type: DataTypes.JSON, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'audit_logs', underscored: false },
)

export default AuditLog
