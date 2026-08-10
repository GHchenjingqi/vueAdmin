import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('workflow_instances', {
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
      comment: '执行时的版本 ID',
    },
    bindingKey: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: '业务标识',
    },
    bindingId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '业务记录 ID',
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: '实例标题',
    },
    status: {
      type: DataTypes.ENUM('pending', 'running', 'partial', 'approved', 'rejected', 'terminated'),
      allowNull: false,
      defaultValue: 'pending',
      comment: '实例状态',
    },
    currentNodeKey: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: '当前停留节点 key',
    },
    input: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '输入数据 JSON',
    },
    output: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '最终输出 JSON',
    },
    startedBy: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '发起人 ID',
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '开始时间',
    },
    finishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '结束时间',
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

  await queryInterface.addIndex('workflow_instances', ['workflowId'], {
    name: 'idx_workflow_instances_workflow_id',
  })
  await queryInterface.addIndex('workflow_instances', ['status'], {
    name: 'idx_workflow_instances_status',
  })
  await queryInterface.addIndex('workflow_instances', ['bindingKey', 'bindingId'], {
    name: 'idx_workflow_instances_binding',
  })
  await queryInterface.addIndex('workflow_instances', ['startedBy'], {
    name: 'idx_workflow_instances_started_by',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('workflow_instances')
}