import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

class KnowledgeCategory extends Model<InferAttributes<KnowledgeCategory>, InferCreationAttributes<KnowledgeCategory>> {
  declare id: CreationOptional<number>
  declare name: string
  declare parentId: CreationOptional<number>
  declare sort: CreationOptional<number>
  declare status: CreationOptional<number>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

KnowledgeCategory.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '分类名称',
  },
  parentId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
    comment: '上级分类 ID',
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
    comment: '状态: 0=禁用, 1=启用',
  },
} as any, {
  sequelize,
  tableName: 'knowledge_categories',
})

export default KnowledgeCategory