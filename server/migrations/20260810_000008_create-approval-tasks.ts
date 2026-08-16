import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('approval_tasks', {
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
      comment: '所属审批节点 key',
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: '审批任务标题',
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'canceled'),
      allowNull: false,
      defaultValue: 'pending',
      comment: '审批状态',
    },
    approverId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '审批人 ID',
    },
    approverName: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: '审批人名称',
    },
    comment: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '审批意见',
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '分配时间',
    },
    finishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '完成时间',
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

  await queryInterface.addIndex('approval_tasks', ['instanceId'], {
    name: 'idx_approval_tasks_instance_id',
  })
  await queryInterface.addIndex('approval_tasks', ['approverId', 'status'], {
    name: 'idx_approval_tasks_approver_id_status',
  })
  await queryInterface.addIndex('approval_tasks', ['status'], {
    name: 'idx_approval_tasks_status',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('approval_tasks')
}