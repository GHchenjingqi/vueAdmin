import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('logs', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    type: {
      type: DataTypes.ENUM('login', 'operation'),
      allowNull: false,
      comment: '日志类型: login=登录日志, operation=操作日志',
    },
    userId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '操作用户 ID',
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: '操作用户名',
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '操作动作',
    },
    target: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: '操作对象描述',
    },
    details: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '操作详情',
    },
    ipAddress: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: '客户端 IP',
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '客户端 User-Agent',
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
  await queryInterface.dropTable('logs')
}