import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 仓库（保税仓 / 海外仓 / 直邮） */
export type WarehouseType = 'bonded' | 'overseas' | 'direct'

class ShopWarehouse extends Model<InferAttributes<ShopWarehouse>, InferCreationAttributes<ShopWarehouse>> {
  declare id: CreationOptional<number>
  declare name: string
  declare type: WarehouseType
  declare country: string
  declare address: string | null
  declare tenantId: number
  declare priority: number
  declare deliveryEstimateDays: number
  declare servedCountries: unknown

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopWarehouse.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '仓库名称' },
    type: {
      type: DataTypes.ENUM('bonded', 'overseas', 'direct'),
      allowNull: false,
      comment: '仓库类型：bonded 保税仓 / overseas 海外仓 / direct 直邮',
    },
    country: { type: DataTypes.STRING(2), allowNull: false, defaultValue: 'CN', comment: '所在国家（ISO2）' },
    address: { type: DataTypes.STRING(500), allowNull: true, comment: '仓库地址' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100, comment: '仓库路由优先级（升序优先）' },
    deliveryEstimateDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5, comment: '该仓库发货的配送承诺（天）' },
    servedCountries: { type: DataTypes.JSON, allowNull: true, comment: '可选区域白名单（ISO2 数组）；空/未配置=服务全部' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'warehouses', underscored: false },
)

export default ShopWarehouse
