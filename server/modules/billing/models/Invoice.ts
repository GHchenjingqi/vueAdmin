import { DataTypes, Model, CreationOptional } from 'sequelize'
import sequelize from '../../../config/database.js'

class Invoice extends Model {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare planId: number
  declare amount: number
  declare currency: string
  declare periodStart: Date
  declare periodEnd: Date
  declare status: string
  declare pdfUrl: string | null
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Invoice.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    planId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'CNY' },
    periodStart: { type: DataTypes.DATE, allowNull: false },
    periodEnd: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    pdfUrl: { type: DataTypes.STRING(255), allowNull: true },
  },
  { sequelize, tableName: 'invoices' },
)

export default Invoice