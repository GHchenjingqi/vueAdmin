import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class WorkflowInstanceLog extends Model<InferAttributes<WorkflowInstanceLog>, InferCreationAttributes<WorkflowInstanceLog>> {
  declare id: CreationOptional<number>
  declare instanceId: number
  declare nodeKey: string
  declare nodeName: string | null
  declare nodeType: string
  declare status: string
  declare input: string | null
  declare output: string | null
  declare error: string | null
  declare duration: number | null
  declare startedAt: Date | null
  declare finishedAt: Date | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

WorkflowInstanceLog.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  instanceId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: '所属实例 ID',
  },
  nodeKey: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '节点 key',
  },
  nodeName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '节点名称',
  },
  nodeType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: '节点类型',
  },
  status: {
    type: DataTypes.ENUM('pending', 'running', 'success', 'failed', 'skipped'),
    allowNull: false,
    defaultValue: 'pending',
    comment: '执行状态',
  },
  input: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '输入数据 JSON',
  },
  output: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '输出数据 JSON',
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '错误信息',
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '耗时（毫秒）',
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
  tableName: 'workflow_instance_logs',
  indexes: [
    { fields: ['instanceId'] },
  ],
})

export default WorkflowInstanceLog