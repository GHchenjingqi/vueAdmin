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
  declare dueAt: Date | null
  declare comment: string | null
  /** 已催办时间（超时提醒已发送） */
  declare remindedAt: Date | null
  /** 是否已升级转交（超时自动转交上级/指定人） */
  declare escalated: CreationOptional<number>
  /** 被委托人原始审批人（委托产生时记录，便于追溯） */
  declare delegatedFrom: number | null
  declare assignedAt: Date | null
  declare finishedAt: Date | null
  /** 租户ID（M1：由租户 scope 钩子按请求上下文注入，DB 默认 1） */
  declare tenantId: number | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ApprovalTask.init(
  {
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
    dueAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '审批超时时间',
    },
    comment: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '审批意见',
    },
    remindedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '已催办时间',
    },
    escalated: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0,
      comment: '是否已升级转交: 0=否 1=是',
    },
    delegatedFrom: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '被委托人原始审批人 ID',
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
    tenantId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '租户ID',
    },
    // 必要 any：Sequelize 6 ModelAttributes 泛型与隐式 timestamps 的摩擦，
    // 详见 models/Workflow.ts 同处注释。
  } as any,
  {
    sequelize,
    tableName: 'approval_tasks',
    indexes: [{ fields: ['instanceId'] }, { fields: ['approverId', 'status'] }, { fields: ['status'] }, { fields: ['tenantId'] }],
  },
)

export default ApprovalTask
