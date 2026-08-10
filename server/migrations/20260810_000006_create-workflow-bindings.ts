import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('workflow_bindings', {
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
      comment: '业务唯一标识',
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
      allowNull: false,
      defaultValue: 1,
      comment: '状态: 0=禁用, 1=启用',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  await queryInterface.addIndex('workflow_bindings', ['workflowId'], {
    name: 'idx_workflow_bindings_workflow_id',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('workflow_bindings')
}