import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class Menu extends Model<InferAttributes<Menu>, InferCreationAttributes<Menu>> {
  declare id: CreationOptional<number>
  declare parentId: number
  declare name: string
  declare path: string
  declare component: string | null
  declare icon: string | null
  declare sort: CreationOptional<number>
  declare type: 'M' | 'C' | 'F'
  declare permission: string | null
  declare status: CreationOptional<number>
  declare hidden: CreationOptional<number>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Menu.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  parentId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
    comment: '父菜单 ID',
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '菜单名称',
  },
  path: {
    type: DataTypes.STRING(200),
    allowNull: false,
    defaultValue: '',
    comment: '路由地址',
  },
  component: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: '组件路径，如 views/Dashboard.vue',
  },
  icon: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '图标',
  },
  sort: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '排序',
  },
  type: {
    type: DataTypes.ENUM('M', 'C', 'F'),
    allowNull: false,
    defaultValue: 'M',
    comment: '类型: M=菜单, C=目录, F=按钮',
  },
  permission: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '权限标识(按钮级)，如 system:user:add',
  },
  status: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1,
    comment: '状态: 1=启用, 0=禁用',
  },
  hidden: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 0,
    comment: '是否隐藏: 1=隐藏, 0=显示',
  },
} as any, {
  sequelize,
  tableName: 'menus',
  indexes: [
    { fields: ['parentId'] },
    { fields: ['status'] },
    { fields: ['hidden'] },
  ],
})

export default Menu