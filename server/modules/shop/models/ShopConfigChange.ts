import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 商城配置变更审计（P0-T05b / P5-T02：谁/何时/从→到/回滚链） */
class ShopConfigChange extends Model<InferAttributes<ShopConfigChange>, InferCreationAttributes<ShopConfigChange>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare key: string
  declare oldValue: unknown
  declare newValue: unknown
  declare operatorId: number | null
  declare operatorName: string | null
  declare effectiveAt: Date | null
  declare appliedAt: Date | null
  declare rollbackOf: number | null
  declare status: CreationOptional<'applied' | 'scheduled' | 'rolled_back'>
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopConfigChange.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    key: { type: DataTypes.STRING(100), allowNull: false },
    oldValue: { type: DataTypes.JSON, allowNull: true },
    newValue: { type: DataTypes.JSON, allowNull: true },
    operatorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    operatorName: { type: DataTypes.STRING(64), allowNull: true },
    effectiveAt: { type: DataTypes.DATE, allowNull: true },
    appliedAt: { type: DataTypes.DATE, allowNull: true },
    rollbackOf: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'applied' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'config_changes', underscored: false },
)

export default ShopConfigChange
