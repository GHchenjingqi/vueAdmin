import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 税率规则（目的国具体税率 / 租户默认税率） */
class ShopTaxRate extends Model<InferAttributes<ShopTaxRate>, InferCreationAttributes<ShopTaxRate>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare country: string
  declare region: string | null
  declare rate: number
  declare isDefault: boolean
  declare priority: number
  declare active: boolean

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopTaxRate.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    country: { type: DataTypes.STRING(2), allowNull: false, defaultValue: '' },
    region: { type: DataTypes.STRING(32), allowNull: true },
    rate: { type: DataTypes.DECIMAL(5, 4), allowNull: false, defaultValue: 0 },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'shop_tax_rates' },
)

export default ShopTaxRate
