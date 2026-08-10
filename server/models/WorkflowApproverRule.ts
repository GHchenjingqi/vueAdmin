import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class WorkflowApproverRule extends Model<InferAttributes<WorkflowApproverRule>, InferCreationAttributes<WorkflowApproverRule>> {
  declare id: CreationOptional<number>
  declare workflowId: number
  declare versionId: number
  declare nodeKey: string
  declare ruleType: string
  declare ruleConfig: string | null
  declare sort: CreationOptional<number>
  declare name: string | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

WorkflowApproverRule.init({
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
    comment: '所属审批节点 key',
  },
  ruleType: {
    type: DataTypes.ENUM('creator', 'direct_leader', 'dept_manager', 'role', 'dept', 'user'),
    allowNull: false,
    comment: '审批人规则类型',
  },
  ruleConfig: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '规则配置 JSON',
  },
  sort: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '排序号',
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '规则名称',
  },
} as any, {
  sequelize,
  tableName: 'workflow_approver_rules',
  indexes: [
    { fields: ['workflowId'] },
    { fields: ['versionId', 'nodeKey'] },
  ],
})

export default WorkflowApproverRule