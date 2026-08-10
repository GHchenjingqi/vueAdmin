import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class WorkflowBinding extends Model<InferAttributes<WorkflowBinding>, InferCreationAttributes<WorkflowBinding>> {
  declare id: CreationOptional<number>
  declare workflowId: number
  declare bindingKey: string
  declare entityName: string | null
  declare formKey: string | null
  declare status: CreationOptional<number>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

WorkflowBinding.init({
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
  bindingKey: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: '业务唯一标识（如 leave-request）',
  },
  entityName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '业务模型名称',
  },
  formKey: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '前端表单 Schema key',
  },
  status: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
    comment: '状态: 0=禁用, 1=启用',
  },
} as any, {
  sequelize,
  tableName: 'workflow_bindings',
  indexes: [
    { fields: ['workflowId'] },
  ],
})

export default WorkflowBinding