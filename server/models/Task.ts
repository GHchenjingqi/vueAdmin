import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../config/database.js'

class Task extends Model<InferAttributes<Task>, InferCreationAttributes<Task>> {
  declare id: CreationOptional<number>
  declare name: string
  declare cronExpression: string
  declare handler: string
  declare status: CreationOptional<number>
  declare description: string | null
  declare lastRunAt: Date | null
  declare lastResult: string | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

Task.init({
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
} as any, {
  sequelize,
  tableName: 'tasks',
})

export default Task