import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class NoticeRead extends Model<InferAttributes<NoticeRead>, InferCreationAttributes<NoticeRead>> {
  declare id: CreationOptional<number>
  declare noticeId: number
  declare userId: number
  declare readAt: CreationOptional<Date>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

NoticeRead.init({
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  noticeId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: '通知 ID',
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    comment: '用户 ID',
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: '阅读时间',
  },
} as any, {
  sequelize,
  tableName: 'notice_reads',
  indexes: [
    { unique: true, fields: ['userId', 'noticeId'] },
  ],
})

export default NoticeRead