import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class Message extends Model<InferAttributes<Message>, InferCreationAttributes<Message>> {
  declare id: CreationOptional<number>
  declare fromUserId: number | null
  declare toUserId: number | null
  declare title: string
  declare content: string
  declare type: CreationOptional<'system' | 'notice' | 'private'>
  declare isRead: CreationOptional<boolean>
  declare readAt: Date | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Message.init({
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
} as any, {
  sequelize,
  tableName: 'messages',
})

export default Message