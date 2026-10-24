import { DataTypes, Model, CreationOptional } from 'sequelize'
import sequelize from '../../../config/database.js'

class Usage extends Model {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare metric: string
  declare period: string
  declare value: number
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Usage.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    metric: { type: DataTypes.STRING(50), allowNull: false },
    period: { type: DataTypes.STRING(8), allowNull: false },
    value: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  },
  { sequelize, tableName: 'usages', indexes: [{ unique: true, fields: ['tenantId', 'metric', 'period'] }] },
)

export default Usage