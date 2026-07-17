import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class RoleMenu extends Model<InferAttributes<RoleMenu>, InferCreationAttributes<RoleMenu>> {
  declare id: CreationOptional<number>
  declare roleId: number
  declare menuId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

RoleMenu.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  roleId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: '角色 ID',
  },
  menuId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: '菜单 ID',
  },
} as any, {
  sequelize,
  tableName: 'role_menus',
  indexes: [{ unique: true, fields: ['roleId', 'menuId'] }],
})

export default RoleMenu