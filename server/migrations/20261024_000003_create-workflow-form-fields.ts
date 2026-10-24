import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('workflow_form_fields', {
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
      comment: '字段标识',
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
      allowNull: false,
      defaultValue: 0,
      comment: '是否必填: 0=否, 1=是',
    },
    options: {
      type: DataTypes.STRING(2000),
      allowNull: true,
      comment: 'select 候选项 JSON',
    },
    placeholder: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: '占位提示',
    },
    sort: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '排序',
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

  await queryInterface.addIndex('workflow_form_fields', ['workflowId'], {
    name: 'idx_wff_workflow_id',
  })
  await queryInterface.addIndex('workflow_form_fields', ['workflowId', 'fieldKey'], {
    name: 'uniq_wff_wf_field',
    unique: true,
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('workflow_form_fields')
}
