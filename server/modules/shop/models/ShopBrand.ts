import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 品牌 */
class ShopBrand extends Model<InferAttributes<ShopBrand>, InferCreationAttributes<ShopBrand>> {
  declare id: CreationOptional<number>
  declare name: string
  declare logo: string | null
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopBrand.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '品牌名称',
    },
    logo: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '品牌 LOGO URL',
    },
    tenantId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '租户ID',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'brands', underscored: false },
)

export default ShopBrand
