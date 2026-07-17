import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('messages', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    fromUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '发送者ID，系统消息为null',
    },
    toUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '接收者ID，null表示全员广播',
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
      comment: '消息标题',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: '消息内容',
    },
    type: {
      type: DataTypes.ENUM('system', 'notice', 'private'),
      defaultValue: 'notice',
      comment: '消息类型: system=系统消息, notice=公告, private=私信',
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: '是否已读',
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '阅读时间',
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
  await queryInterface.dropTable('messages')
}