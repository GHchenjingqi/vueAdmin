import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 注意：模型字段为 runtimeState / dueAt，且全局 underscored:false，
  // 因此列名必须为驼峰（与 currentNodeKey、startedBy 等既有列保持一致）。
  await queryInterface.addColumn('workflow_instances', 'runtimeState', {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: '引擎运行时状态(JSON)：上下文、已完成/已启动节点、前驱完成集合、审批节点状态',
  })
  await queryInterface.addColumn('approval_tasks', 'dueAt', {
    type: DataTypes.DATE,
    allowNull: true,
    comment: '审批超时时间（超时后可由调度任务升级/自动处理）',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('approval_tasks', 'dueAt')
  await queryInterface.removeColumn('workflow_instances', 'runtimeState')
}
