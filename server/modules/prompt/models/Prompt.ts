import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

export type PromptStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'offline'
export type PromptType = 'single' | 'sequence'

class Prompt extends Model<InferAttributes<Prompt>, InferCreationAttributes<Prompt>> {
  declare id: CreationOptional<number>
  declare title: string
  declare content: string
  declare categoryId: number
  declare modelName: string
  declare type: CreationOptional<PromptType>
  declare characterAnchor: CreationOptional<string | null>
  declare status: CreationOptional<PromptStatus>
  declare source: CreationOptional<'admin' | 'user'>
  declare authorId: number
  declare rejectReason: CreationOptional<string | null>
  declare reviewedBy: CreationOptional<number | null>
  declare reviewedAt: CreationOptional<Date | null>
  declare viewCount: CreationOptional<number>
  declare isDeleted: CreationOptional<number>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Prompt.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(200), allowNull: false, comment: '标题' },
    content: { type: DataTypes.TEXT, allowNull: false, comment: '提示词正文' },
    categoryId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '分类 ID' },
    modelName: { type: DataTypes.STRING(100), allowNull: false, comment: '模型名称' },
    type: { type: DataTypes.ENUM('single', 'sequence'), allowNull: false, defaultValue: 'single', comment: '内容形态' },
    characterAnchor: { type: DataTypes.TEXT, allowNull: true, comment: '角色锚定提示词' },
    status: { type: DataTypes.ENUM('draft', 'pending', 'published', 'rejected', 'offline'), allowNull: false, defaultValue: 'draft' },
    source: { type: DataTypes.ENUM('admin', 'user'), allowNull: false, defaultValue: 'admin' },
    authorId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '作者用户 ID' },
    rejectReason: { type: DataTypes.STRING(500), allowNull: true },
    reviewedBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    viewCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    isDeleted: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  } as any,
  {
    sequelize,
    tableName: 'prompts',
  },
)

export default Prompt
