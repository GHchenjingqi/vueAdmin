import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** C 端顾客地址簿（步骤 5 顾客账户使用，此处先建表） */
class ShopCustomerAddress extends Model<InferAttributes<ShopCustomerAddress>, InferCreationAttributes<ShopCustomerAddress>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare customerId: number
  declare fullName: string
  declare phone: string
  declare country: string
  declare province: string
  declare city: string
  declare address1: string
  declare address2: string | null
  declare postcode: string
  declare isDefault: CreationOptional<number>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopCustomerAddress.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    fullName: { type: DataTypes.STRING(120), allowNull: false },
    phone: { type: DataTypes.STRING(32), allowNull: false },
    country: { type: DataTypes.STRING(2), allowNull: false, comment: 'ISO 3166-1 alpha-2' },
    province: { type: DataTypes.STRING(64), allowNull: false },
    city: { type: DataTypes.STRING(64), allowNull: false },
    address1: { type: DataTypes.STRING(255), allowNull: false },
    address2: { type: DataTypes.STRING(255), allowNull: true },
    postcode: { type: DataTypes.STRING(20), allowNull: false },
    isDefault: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'customer_addresses',
    indexes: [{ fields: ['tenantId', 'customerId'], name: 'idx_caddr_tenant_customer' }],
  },
)

export default ShopCustomerAddress
