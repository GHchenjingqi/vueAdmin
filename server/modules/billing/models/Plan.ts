import { DataTypes, Model, CreationOptional } from 'sequelize'
import sequelize from '../../../config/database.js'

class Plan extends Model {
  declare id: CreationOptional<number>
  declare code: string
  declare name: string
  declare priceMonthly: number
  declare priceYearly: number
  declare limits: Record<string, number>
  declare features: Record<string, boolean>
  declare status: CreationOptional<number>
  declare sort: CreationOptional<number>
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Plan.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    priceMonthly: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    priceYearly: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    limits: { type: DataTypes.JSON, allowNull: false },
    features: { type: DataTypes.JSON, allowNull: false },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1 },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { sequelize, tableName: 'plans' },
)

export default Plan