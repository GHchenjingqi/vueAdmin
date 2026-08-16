import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

class KnowledgeContent extends Model<InferAttributes<KnowledgeContent>, InferCreationAttributes<KnowledgeContent>> {
  declare id: CreationOptional<number>
  declare title: string
  declare summary: CreationOptional<string>
  declare body: string
  declare categoryId: number | null
  declare author: string
  declare status: CreationOptional<string>
  declare publishTime: Date | null
  declare viewCount: CreationOptional<number>
  declare cover: CreationOptional<string | null>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

KnowledgeContent.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: '内容标题',
  },
  summary: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '内容摘要',
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '正文内容',
  },
  categoryId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: '所属分类 ID',
  },
  author: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: '',
    comment: '作者',
  },
  status: {
    type: DataTypes.ENUM('draft', 'published'),
    allowNull: false,
    defaultValue: 'draft',
    comment: '状态: draft=草稿, published=已发布',
  },
  publishTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '发布时间',
  },
  viewCount: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
    comment: '浏览次数',
  },
  cover: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '封面图片 URL',
  },
} as any, {
  sequelize,
  tableName: 'knowledge_contents',
})

export default KnowledgeContent