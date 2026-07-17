import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

/**
 * 系统设置模型（借鉴 WordPress options 表设计）
 * - key-value 键值对存储
 * - autoload 标记：是否在启动时自动加载到缓存
 * - 支持分组管理
 */
class Setting extends Model<InferAttributes<Setting>, InferCreationAttributes<Setting>> {
  declare id: CreationOptional<number>
  declare optionKey: string
  declare optionValue: string
  declare autoload: CreationOptional<number>
  declare description: string | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Setting.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  optionKey: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: '设置键名，如 site_title、site_logo',
  },
  optionValue: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
    comment: '设置值，支持 JSON 格式',
  },
  autoload: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1,
    comment: '是否自动加载: 1=是, 0=否',
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: '设置项说明',
  },
} as any, {
  sequelize,
  tableName: 'settings',
})

export default Setting