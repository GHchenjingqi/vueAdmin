import { DataTypes, Model, CreationOptional } from 'sequelize'
import sequelize from '../../../config/database.js'

class Tenant extends Model {
  declare id: CreationOptional<number>
  declare name: string
  declare code: string
  declare status: number
  declare planId: number | null
  declare expiresAt: Date | null
  declare settings: Record<string, unknown> | null
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Tenant.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '租户名',
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: '租户编码',
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
      comment: '1=启用 0=禁用 2=冻结',
    },
    planId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '套餐ID',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '到期时间',
    },
    settings: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '租户级配置',
    },
  },
  {
    sequelize,
    tableName: 'tenants',
  },
)

export default Tenant
