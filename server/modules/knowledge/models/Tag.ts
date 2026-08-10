import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

class KnowledgeTag extends Model<InferAttributes<KnowledgeTag>, InferCreationAttributes<KnowledgeTag>> {
  declare id: CreationOptional<number>
  declare name: string
  declare color: CreationOptional<string>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

KnowledgeTag.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '标签名称',
  },
  color: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: '#409EFF',
    comment: '标签颜色',
  },
} as any, {
  sequelize,
  tableName: 'knowledge_tags',
})

export default KnowledgeTag