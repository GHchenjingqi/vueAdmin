import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class Department extends Model<InferAttributes<Department>, InferCreationAttributes<Department>> {
  declare id: CreationOptional<number>
  declare parentId: number
  declare name: string
  declare sort: CreationOptional<number>
  declare leader: string | null
  declare phone: string | null
  declare email: string | null
  declare status: CreationOptional<number>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Department.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  parentId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
    comment: '父部门 ID',
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '部门名称',
  },
  sort: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '排序',
  },
  leader: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '负责人',
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: '联系电话',
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '邮箱',
  },
  status: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1,
    comment: '状态: 1=启用, 0=禁用',
  },
} as any, {
  sequelize,
  tableName: 'departments',
})

export default Department