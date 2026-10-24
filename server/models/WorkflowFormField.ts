import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

/**
 * 工作流表单字段：定义「业务模块发起流程时需要填写的参数」。
 * 挂在 workflowId 维度（MVP，不随版本），便于业务发起页按工作流动态渲染表单。
 */
class WorkflowFormField extends Model<InferAttributes<WorkflowFormField>, InferCreationAttributes<WorkflowFormField>> {
  declare id: CreationOptional<number>
  declare workflowId: number
  declare fieldKey: string
  declare label: string
  declare type: 'text' | 'textarea' | 'number' | 'select' | 'date'
  declare required: CreationOptional<number>
  declare options: string | null
  declare placeholder: string | null
  declare sort: CreationOptional<number>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

WorkflowFormField.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    workflowId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '关联流程 ID',
    },
    fieldKey: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '字段标识（提交时作为 input 的 key）',
    },
    label: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '字段显示名称',
    },
    type: {
      type: DataTypes.ENUM('text', 'textarea', 'number', 'select', 'date'),
      allowNull: false,
      defaultValue: 'text',
      comment: '字段类型',
    },
    required: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
      comment: '是否必填: 0=否, 1=是',
    },
    options: {
      type: DataTypes.STRING(2000),
      allowNull: true,
      comment: 'select 类型的候选项（JSON 数组，如 ["a","b"]）',
    },
    placeholder: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: '输入占位提示',
    },
    sort: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: '排序',
    },
  } as any,
  {
    sequelize,
    tableName: 'workflow_form_fields',
    indexes: [{ fields: ['workflowId'] }, { fields: ['workflowId', 'fieldKey'], unique: true, name: 'uniq_wff_wf_field' }],
  },
)

export default WorkflowFormField
