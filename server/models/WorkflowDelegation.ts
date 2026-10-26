import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

/**
 * 委托审批：用户可把自己的待办临时委托给他人（含生效时间区间）。
 * 引擎派单时若审批人处于有效委托期，则转交被委托人处理。
 */
class WorkflowDelegation extends Model<InferAttributes<WorkflowDelegation>, InferCreationAttributes<WorkflowDelegation>> {
  declare id: CreationOptional<number>
  declare fromUserId: number
  declare toUserId: number
  declare startAt: Date
  declare endAt: Date | null
  declare remark: string | null
  declare status: CreationOptional<number>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

WorkflowDelegation.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    fromUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '委托方（本人）',
    },
    toUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '被委托人',
    },
    startAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: '生效开始时间',
    },
    endAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '生效结束时间（为空表示长期）',
    },
    remark: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: '委托说明',
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
      comment: '状态: 1=有效 0=已取消',
    },
  } as any,
  {
    sequelize,
    tableName: 'workflow_delegations',
    indexes: [{ fields: ['fromUserId'] }, { fields: ['toUserId'] }, { fields: ['status'] }],
  },
)

export default WorkflowDelegation
