import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class WorkflowNode extends Model<InferAttributes<WorkflowNode>, InferCreationAttributes<WorkflowNode>> {
  declare id: CreationOptional<number>
  declare workflowId: number
  declare versionId: number
  declare nodeKey: string
  declare name: string
  declare type: string
  declare config: string | null
  declare x: number | null
  declare y: number | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

WorkflowNode.init({
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
  nodeKey: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '节点唯一标识（稳定 id，用于连线引用）',
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '节点名称',
  },
  type: {
    type: DataTypes.ENUM('start', 'end', 'condition', 'approve', 'notify'),
    allowNull: false,
    comment: '节点类型',
  },
  config: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '节点配置 JSON',
  },
  x: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '画布 X 坐标',
  },
  y: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '画布 Y 坐标',
  },
} as any, {
  sequelize,
  tableName: 'workflow_nodes',
  indexes: [
    { unique: true, fields: ['versionId', 'nodeKey'] },
    { fields: ['workflowId'] },
    { fields: ['versionId'] },
  ],
})

export default WorkflowNode