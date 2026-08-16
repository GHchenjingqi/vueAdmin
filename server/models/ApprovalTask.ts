import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class ApprovalTask extends Model<InferAttributes<ApprovalTask>, InferCreationAttributes<ApprovalTask>> {
  declare id: CreationOptional<number>
  declare instanceId: number
  declare nodeKey: string
  declare title: string | null
  declare status: string
  declare approverId: number | null
  declare approverName: string | null
  declare comment: string | null
  declare assignedAt: Date | null
  declare finishedAt: Date | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ApprovalTask.init({
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
    comment: '所属审批节点 key',
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: true,
    comment: '审批任务标题',
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected', 'canceled'),
    allowNull: false,
    defaultValue: 'pending',
    comment: '审批状态',
  },
  approverId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: true,
    comment: '审批人 ID',
  },
  approverName: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: '审批人名称',
  },
  comment: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '审批意见',
  },
  assignedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '分配时间',
  },
  finishedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '完成时间',
  },
} as any, {
  sequelize,
  tableName: 'approval_tasks',
  indexes: [
    { fields: ['instanceId'] },
    { fields: ['approverId', 'status'] },
    { fields: ['status'] },
  ],
})

export default ApprovalTask