import { DataTypes, Model, CreationOptional } from 'sequelize'
import sequelize from '../../../config/database.js'

class Subscription extends Model {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare planId: number
  declare status: string
  declare currentPeriodStart: Date
  declare currentPeriodEnd: Date
  declare trialEndAt: Date | null
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Subscription.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    planId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    currentPeriodStart: { type: DataTypes.DATE, allowNull: false },
    currentPeriodEnd: { type: DataTypes.DATE, allowNull: false },
    trialEndAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'subscriptions' },
)

export default Subscription