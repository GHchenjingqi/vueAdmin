import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class WorkflowInstance extends Model<InferAttributes<WorkflowInstance>, InferCreationAttributes<WorkflowInstance>> {
  declare id: CreationOptional<number>
  declare workflowId: number
  declare versionId: number
  declare bindingKey: string | null
  declare bindingId: number | null
  declare title: string | null
  declare status: string
  declare currentNodeKey: string | null
  declare input: string | null
  declare output: string | null
  declare startedBy: number | null
  declare startedAt: Date | null
  declare finishedAt: Date | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

WorkflowInstance.init({
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
    comment: '执行时的版本 ID',
  },
  bindingKey: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '业务标识',
  },
  bindingId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: '业务记录 ID',
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: '实例标题',
  },
  status: {
    type: DataTypes.ENUM('pending', 'running', 'partial', 'approved', 'rejected', 'terminated'),
    allowNull: false,
    defaultValue: 'pending',
    comment: '实例状态',
  },
  currentNodeKey: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '当前停留节点 key',
  },
  input: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '输入数据 JSON',
  },
  output: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '最终输出 JSON',
  },
  startedBy: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: '发起人 ID',
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '开始时间',
  },
  finishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '结束时间',
  },
} as any, {
  sequelize,
  tableName: 'workflow_instances',
  indexes: [
    { fields: ['workflowId'] },
    { fields: ['status'] },
    { fields: ['bindingKey', 'bindingId'] },
    { fields: ['startedBy'] },
  ],
})

export default WorkflowInstance