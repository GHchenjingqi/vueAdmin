import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class WorkflowVersion extends Model<InferAttributes<WorkflowVersion>, InferCreationAttributes<WorkflowVersion>> {
  declare id: CreationOptional<number>
  declare workflowId: number
  declare versionNo: number
  declare status: string
  declare publishedAt: Date | null
  declare publishedBy: number | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

WorkflowVersion.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  workflowId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: '所属流程 ID',
  },
  versionNo: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '版本号',
  },
  status: {
    type: DataTypes.ENUM('draft', 'published'),
    allowNull: false,
    defaultValue: 'draft',
    comment: '版本状态: draft=草稿, published=已发布',
  },
  publishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '发布时间',
  },
  publishedBy: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: '发布人 ID',
  },
} as any, {
  sequelize,
  tableName: 'workflow_versions',
  indexes: [
    { unique: true, fields: ['workflowId', 'versionNo'] },
    { fields: ['workflowId'] },
  ],
})

export default WorkflowVersion