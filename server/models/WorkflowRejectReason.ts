import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

/**
 * 常用驳回理由：从硬编码改为数据库可维护。
 * 审批人在快速驳回时可一键选用；enabled=0 的理由对用户隐藏但仍保留历史。
 */
class WorkflowRejectReason extends Model<InferAttributes<WorkflowRejectReason>, InferCreationAttributes<WorkflowRejectReason>> {
  declare id: CreationOptional<number>
  declare content: string
  declare sort: CreationOptional<number>
  declare enabled: CreationOptional<number>
  declare createdBy: number | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

WorkflowRejectReason.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    content: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: '驳回理由文本',
    },
    sort: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '排序，越小越靠前',
    },
    enabled: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
      comment: '是否启用: 1=启用 0=停用',
    },
    createdBy: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '维护人',
    },
  } as any,
  {
    sequelize,
    tableName: 'workflow_reject_reasons',
    indexes: [{ fields: ['enabled'] }, { fields: ['sort'] }],
  },
)

export default WorkflowRejectReason
