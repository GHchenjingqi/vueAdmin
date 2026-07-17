import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('tasks', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '任务名称',
    },
    cronExpression: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Cron 表达式',
    },
    handler: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '任务处理函数标识',
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
      comment: '状态: 0=暂停, 1=运行中',
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '任务描述',
    },
    lastRunAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '上次执行时间',
    },
    lastResult: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '上次执行结果',
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
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('tasks')
}