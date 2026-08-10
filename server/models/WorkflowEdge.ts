import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class WorkflowEdge extends Model<InferAttributes<WorkflowEdge>, InferCreationAttributes<WorkflowEdge>> {
  declare id: CreationOptional<number>
  declare workflowId: number
  declare versionId: number
  declare sourceNodeKey: string
  declare targetNodeKey: string
  declare conditionType: string
  declare conditionExpr: string | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

WorkflowEdge.init({
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
  versionId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: '所属版本 ID',
  },
  sourceNodeKey: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '源节点 key',
  },
  targetNodeKey: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '目标节点 key',
  },
  conditionType: {
    type: DataTypes.ENUM('always', 'expression'),
    allowNull: false,
    defaultValue: 'always',
    comment: '条件类型: always=无条件, expression=条件表达式',
  },
  conditionExpr: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '条件表达式（conditionType=expression 时）',
  },
} as any, {
  sequelize,
  tableName: 'workflow_edges',
  indexes: [
    { fields: ['workflowId'] },
    { fields: ['versionId'] },
  ],
})

export default WorkflowEdge