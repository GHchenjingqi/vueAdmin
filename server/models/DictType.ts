import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

/**
 * 字典类型模型
 * 定义字典的分类，如：通知类型、性别等
 */
class DictType extends Model<InferAttributes<DictType>, InferCreationAttributes<DictType>> {
  declare id: CreationOptional<number>
  declare name: string
  declare type: string
  declare status: CreationOptional<number>
  declare remark: string | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

DictType.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '字典名称，如 通知类型、性别',
  },
  type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: '字典类型编码，如 notice_type、gender',
  },
  status: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1,
    comment: '状态: 1=启用, 0=禁用',
  },
  remark: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: '备注',
  },
} as any, {
  sequelize,
  tableName: 'dict_types',
})

export default DictType