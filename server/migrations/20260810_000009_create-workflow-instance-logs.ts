import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('workflow_instance_logs', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    instanceId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '所属实例 ID',
    },
    nodeKey: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '节点 key',
    },
    nodeName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: '节点名称',
    },
    nodeType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: '节点类型',
    },
    status: {
      type: DataTypes.ENUM('pending', 'running', 'success', 'failed', 'skipped'),
      allowNull: false,
      defaultValue: 'pending',
      comment: '执行状态',
    },
    input: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '输入数据 JSON',
    },
    output: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '输出数据 JSON',
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '错误信息',
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: '耗时（毫秒）',
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

  await queryInterface.addIndex('workflow_instance_logs', ['instanceId'], {
    name: 'idx_instance_logs_instance_id',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('workflow_instance_logs')
}