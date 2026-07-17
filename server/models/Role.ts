import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class Role extends Model<InferAttributes<Role>, InferCreationAttributes<Role>> {
  declare id: CreationOptional<number>
  declare name: string
  declare code: string
  declare sort: CreationOptional<number>
  declare status: CreationOptional<number>
  declare dataScope: CreationOptional<number>
  declare remark: string | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Role.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true,
    comment: '角色名称',
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: '角色编码',
  },
  sort: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '排序',
  },
  status: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1,
    comment: '状态: 1=启用, 0=禁用',
  },
  dataScope: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1,
    comment: '数据范围: 1=全部, 2=本部门, 3=本级及以下',
  },
  remark: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: '备注',
  },
} as any, {
  sequelize,
  tableName: 'roles',
})

export default Role