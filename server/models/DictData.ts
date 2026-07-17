import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

/**
 * 字典数据模型
 * 每个字典类型下的具体选项，如 notice_type 下有：通知、消息
 */
class DictData extends Model<InferAttributes<DictData>, InferCreationAttributes<DictData>> {
  declare id: CreationOptional<number>
  declare dictType: string
  declare label: string
  declare value: string
  declare sort: CreationOptional<number>
  declare status: CreationOptional<number>
  declare remark: string | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

DictData.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  dictType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '所属字典类型编码，如 notice_type、gender',
  },
  label: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '字典标签，如 通知、男',
  },
  value: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '字典值，如 notice、1',
  },
  sort: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '排序，越小越靠前',
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
  tableName: 'dict_data',
})

export default DictData