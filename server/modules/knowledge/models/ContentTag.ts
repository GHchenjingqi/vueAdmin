import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

class KnowledgeContentTag extends Model<InferAttributes<KnowledgeContentTag>, InferCreationAttributes<KnowledgeContentTag>> {
  declare id: CreationOptional<number>
  declare contentId: number
  declare tagId: number
}

KnowledgeContentTag.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  contentId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: '内容 ID',
  },
  tagId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: '标签 ID',
  },
} as any, {
  sequelize,
  tableName: 'knowledge_content_tags',
  indexes: [
    { unique: true, fields: ['contentId', 'tagId'] },
  ],
})

export default KnowledgeContentTag