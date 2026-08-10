import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class Workflow extends Model<InferAttributes<Workflow>, InferCreationAttributes<Workflow>> {
  declare id: CreationOptional<number>
  declare name: string
  declare description: string | null
  declare status: CreationOptional<number>
  declare draftVersionId: number | null
  declare publishedVersionId: number | null
  declare createdBy: number | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Workflow.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '流程名称',
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '流程描述',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
    comment: '状态: 0=禁用, 1=启用',
  },
  draftVersionId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: '当前草稿版本 ID',
  },
  publishedVersionId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: '当前线上版本 ID',
  },
  createdBy: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: '创建人 ID',
  },
} as any, {
  sequelize,
  tableName: 'workflows',
})

export default Workflow