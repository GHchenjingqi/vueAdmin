import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('workflow_edges', {
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
    sourceNodeKey: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '源节点 key',
    },
    targetNodeKey: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '目标节点 key',
    },
    conditionType: {
      type: DataTypes.ENUM('always', 'expression'),
      allowNull: false,
      defaultValue: 'always',
      comment: '条件类型: always=无条件, expression=条件表达式',
    },
    conditionExpr: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '条件表达式',
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

  await queryInterface.addIndex('workflow_edges', ['workflowId'], {
    name: 'idx_workflow_edges_workflow_id',
  })
  await queryInterface.addIndex('workflow_edges', ['versionId'], {
    name: 'idx_workflow_edges_version_id',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('workflow_edges')
}