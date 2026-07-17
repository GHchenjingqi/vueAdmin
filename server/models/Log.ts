import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class Log extends Model<InferAttributes<Log>, InferCreationAttributes<Log>> {
  declare id: CreationOptional<number>
  declare type: 'login' | 'operation'
  declare userId: number | null
  declare username: string | null
  declare action: string
  declare target: string | null
  declare details: string | null
  declare ipAddress: string | null
  declare userAgent: string | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Log.init({
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
} as any, {
  sequelize,
  tableName: 'logs',
})

export default Log