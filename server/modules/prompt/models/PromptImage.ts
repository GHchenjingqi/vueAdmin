import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

class PromptImage extends Model<InferAttributes<PromptImage>, InferCreationAttributes<PromptImage>> {
  declare id: CreationOptional<number>
  declare promptId: number
  declare platformId: CreationOptional<number>
  declare stepId: CreationOptional<number | null>
  declare url: string
  declare filePath: CreationOptional<string | null>
  declare sort: CreationOptional<number>
  declare isCover: CreationOptional<number>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

PromptImage.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    promptId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '提示词 ID' },
    platformId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, defaultValue: 1, comment: '平台字典 ID' },
    stepId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '所属步骤 ID' },
    url: { type: DataTypes.STRING(500), allowNull: false, comment: '访问地址' },
    filePath: { type: DataTypes.STRING(500), allowNull: true, comment: '相对存储路径' },
    sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '排序，越小越靠前' },
    isCover: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0, comment: '是否封面: 1/0' },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  } as any,
  {
    sequelize,
    tableName: 'prompt_images',
  },
)

export default PromptImage
