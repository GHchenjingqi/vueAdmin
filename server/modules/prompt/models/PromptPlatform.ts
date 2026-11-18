import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

class PromptPlatform extends Model<InferAttributes<PromptPlatform>, InferCreationAttributes<PromptPlatform>> {
  declare id: CreationOptional<number>
  declare name: string
  declare sort: CreationOptional<number>
  declare status: CreationOptional<number>
  declare builtin: CreationOptional<number>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

PromptPlatform.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '平台名称' },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序，越小越靠前' },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '状态: 1=启用, 0=停用' },
    builtin: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0, comment: '是否内置平台: 1/0' },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  } as any,
  {
    sequelize,
    tableName: 'prompt_platforms',
  },
)

export default PromptPlatform
