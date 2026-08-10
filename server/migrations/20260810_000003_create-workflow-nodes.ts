import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('workflow_nodes', {
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
      comment: '节点唯一标识',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '节点名称',
    },
    type: {
      type: DataTypes.ENUM('start', 'end', 'condition', 'approve', 'notify'),
      allowNull: false,
      comment: '节点类型',
    },
    config: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '节点配置 JSON',
    },
    x: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: '画布 X 坐标',
    },
    y: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: '画布 Y 坐标',
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

  await queryInterface.addIndex('workflow_nodes', ['versionId', 'nodeKey'], {
    unique: true,
    name: 'uq_workflow_nodes_version_id_node_key',
  })
  await queryInterface.addIndex('workflow_nodes', ['workflowId'], {
    name: 'idx_workflow_nodes_workflow_id',
  })
  await queryInterface.addIndex('workflow_nodes', ['versionId'], {
    name: 'idx_workflow_nodes_version_id',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('workflow_nodes')
}