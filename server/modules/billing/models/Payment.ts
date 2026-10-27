import { DataTypes, Model, CreationOptional } from 'sequelize'
import sequelize from '../../../config/database.js'

class Payment extends Model {
  declare id: CreationOptional<number>
  declare invoiceId: number
  declare tenantId: number
  declare provider: string
  declare providerOrderId: string | null
  declare amount: number
  declare status: string
  declare paidAt: Date | null
  declare raw: Record<string, unknown> | null
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Payment.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    invoiceId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    provider: { type: DataTypes.STRING(50), allowNull: false },
    providerOrderId: { type: DataTypes.STRING(100), allowNull: true },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    raw: { type: DataTypes.JSON, allowNull: true },
  },
  { sequelize, tableName: 'payments' },
)

export default Payment