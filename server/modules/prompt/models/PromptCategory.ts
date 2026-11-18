import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

class PromptCategory extends Model<InferAttributes<PromptCategory>, InferCreationAttributes<PromptCategory>> {
  declare id: CreationOptional<number>
  declare name: string
  declare description: CreationOptional<string | null>
  declare sort: CreationOptional<number>
  declare status: CreationOptional<number>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

PromptCategory.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false, comment: '分类名称' },
    description: { type: DataTypes.STRING(255), allowNull: true, comment: '分类描述' },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序，越小越靠前' },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '状态: 1=启用, 0=停用' },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  } as any,
  {
    sequelize,
    tableName: 'prompt_categories',
  },
)

export default PromptCategory
