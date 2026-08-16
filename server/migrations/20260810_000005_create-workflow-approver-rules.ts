import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('workflow_approver_rules', {
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
      allowNull: false,
      defaultValue: 0,
      comment: '排序号',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: '规则名称',
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

  await queryInterface.addIndex('workflow_approver_rules', ['workflowId'], {
    name: 'idx_approver_rules_workflow_id',
  })
  await queryInterface.addIndex('workflow_approver_rules', ['versionId', 'nodeKey'], {
    name: 'idx_approver_rules_version_id_node_key',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('workflow_approver_rules')
}